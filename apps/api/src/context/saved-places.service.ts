import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { savedLocationAliases, savedLocations } from '../db/schema';
import type {
  CreateSavedPlaceDto,
  UpdateSavedPlaceDto,
} from './dto/saved-place.dto';
import type { ResolvedPlace, SavedPlace } from './entities/personal-context.types';
import { normalizeAlias, textContainsAlias } from './place-alias.util';

type PlaceRow = typeof savedLocations.$inferSelect;
type AliasRow = typeof savedLocationAliases.$inferSelect;

/**
 * CRUD for a user's saved places plus their natural-language aliases, and the
 * resolver the AI reminder parser uses to turn a place mention ("البيت", "campus")
 * into a canonical saved place. Every query is scoped to the authenticated user.
 */
@Injectable()
export class SavedPlacesService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async list(userId: string): Promise<SavedPlace[]> {
    const places = await this.db
      .select()
      .from(savedLocations)
      .where(eq(savedLocations.userId, userId));
    if (places.length === 0) return [];

    const aliases = await this.db
      .select()
      .from(savedLocationAliases)
      .where(eq(savedLocationAliases.userId, userId));

    const aliasesByPlace = groupAliases(aliases);
    return places
      .map((place) => toSavedPlace(place, aliasesByPlace.get(place.id) ?? []))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findOne(userId: string, id: string): Promise<SavedPlace> {
    const [place] = await this.db
      .select()
      .from(savedLocations)
      .where(and(eq(savedLocations.userId, userId), eq(savedLocations.id, id)))
      .limit(1);
    if (!place) throw new NotFoundException('Saved place not found.');

    const aliases = await this.db
      .select()
      .from(savedLocationAliases)
      .where(eq(savedLocationAliases.savedLocationId, id));
    return toSavedPlace(place, aliases);
  }

  async create(userId: string, dto: CreateSavedPlaceDto): Promise<SavedPlace> {
    return this.db.transaction(async (tx) => {
      const [place] = await tx
        .insert(savedLocations)
        .values({
          userId,
          name: dto.name.trim(),
          icon: normalizeOptional(dto.icon),
          address: normalizeOptional(dto.address),
          category: normalizeOptional(dto.category),
          latitude: String(dto.latitude),
          longitude: String(dto.longitude),
          radiusMeters: dto.radiusMeters ?? 100,
        })
        .returning();

      const aliasRows = await this.replaceAliases(
        tx,
        userId,
        place.id,
        dto.aliases ?? [],
      );
      return toSavedPlace(place, aliasRows);
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSavedPlaceDto,
  ): Promise<SavedPlace> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(savedLocations)
        .where(and(eq(savedLocations.userId, userId), eq(savedLocations.id, id)))
        .limit(1);
      if (!existing) throw new NotFoundException('Saved place not found.');

      const [place] = await tx
        .update(savedLocations)
        .set({
          name: dto.name?.trim() ?? existing.name,
          icon: dto.icon !== undefined ? normalizeOptional(dto.icon) : existing.icon,
          address:
            dto.address !== undefined
              ? normalizeOptional(dto.address)
              : existing.address,
          category:
            dto.category !== undefined
              ? normalizeOptional(dto.category)
              : existing.category,
          latitude:
            dto.latitude !== undefined ? String(dto.latitude) : existing.latitude,
          longitude:
            dto.longitude !== undefined
              ? String(dto.longitude)
              : existing.longitude,
          radiusMeters: dto.radiusMeters ?? existing.radiusMeters,
          updatedAt: new Date(),
        })
        .where(and(eq(savedLocations.userId, userId), eq(savedLocations.id, id)))
        .returning();

      // aliases: only touch them when the caller explicitly sends the field.
      let aliasRows: AliasRow[];
      if (dto.aliases !== undefined) {
        aliasRows = await this.replaceAliases(tx, userId, id, dto.aliases);
      } else {
        aliasRows = await tx
          .select()
          .from(savedLocationAliases)
          .where(eq(savedLocationAliases.savedLocationId, id));
      }
      return toSavedPlace(place, aliasRows);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: savedLocations.id })
      .from(savedLocations)
      .where(and(eq(savedLocations.userId, userId), eq(savedLocations.id, id)))
      .limit(1);
    if (!existing) throw new NotFoundException('Saved place not found.');
    // Aliases cascade via FK; a recurring commitment's savedLocationId is set null.
    await this.db.delete(savedLocations).where(eq(savedLocations.id, id));
  }

  /**
   * Resolve any place mentions in free text to canonical saved places. Matches
   * the user's explicit aliases plus each place's name and category, preferring
   * the longest (most specific) matched alias. Used by the AI reminder parser.
   */
  async resolvePlacesFromText(
    userId: string,
    text: string,
  ): Promise<ResolvedPlace[]> {
    if (!text.trim()) return [];
    const places = await this.list(userId);
    if (places.length === 0) return [];

    const resolved: ResolvedPlace[] = [];
    for (const place of places) {
      const candidates = buildMatchCandidates(place);
      // Prefer the longest matching candidate so "coffee shop" wins over "shop".
      let matched: string | null = null;
      for (const candidate of candidates) {
        if (!textContainsAlias(text, candidate.normalized)) continue;
        if (!matched || candidate.normalized.length > matched.length) {
          matched = candidate.normalized;
        }
      }
      if (matched) {
        resolved.push({
          id: place.id,
          name: place.name,
          category: place.category,
          latitude: place.latitude,
          longitude: place.longitude,
          radiusMeters: place.radiusMeters,
          address: place.address,
          matchedAlias: matched,
        });
      }
    }

    // Most specific (longest matched alias) first.
    return resolved.sort(
      (a, b) => b.matchedAlias.length - a.matchedAlias.length,
    );
  }

  /**
   * Replace the full alias set for a place. Normalizes + dedupes the incoming
   * list, and reassigns any alias currently owned by a *different* place of the
   * same user (last-write-wins) so the unique (user, normalized_alias) index
   * never throws.
   */
  private async replaceAliases(
    tx: DbTx,
    userId: string,
    placeId: string,
    rawAliases: string[],
  ): Promise<AliasRow[]> {
    await tx
      .delete(savedLocationAliases)
      .where(eq(savedLocationAliases.savedLocationId, placeId));

    const seen = new Set<string>();
    const toInsert: {
      savedLocationId: string;
      userId: string;
      alias: string;
      normalizedAlias: string;
    }[] = [];
    for (const raw of rawAliases) {
      const alias = raw.trim();
      const normalized = normalizeAlias(alias);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      toInsert.push({
        savedLocationId: placeId,
        userId,
        alias,
        normalizedAlias: normalized,
      });
    }

    if (toInsert.length === 0) return [];

    // Free up any normalized aliases currently owned by other places (this user).
    await tx
      .delete(savedLocationAliases)
      .where(
        and(
          eq(savedLocationAliases.userId, userId),
          inArray(
            savedLocationAliases.normalizedAlias,
            toInsert.map((row) => row.normalizedAlias),
          ),
        ),
      );

    return tx.insert(savedLocationAliases).values(toInsert).returning();
  }
}

type DbTx = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

function normalizeOptional(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function groupAliases(aliases: AliasRow[]): Map<string, AliasRow[]> {
  const map = new Map<string, AliasRow[]>();
  for (const alias of aliases) {
    const list = map.get(alias.savedLocationId) ?? [];
    list.push(alias);
    map.set(alias.savedLocationId, list);
  }
  return map;
}

function toSavedPlace(place: PlaceRow, aliases: AliasRow[]): SavedPlace {
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new BadRequestException('Saved place has invalid coordinates.');
  }
  return {
    id: place.id,
    name: place.name,
    icon: place.icon ?? null,
    address: place.address ?? null,
    category: place.category ?? null,
    latitude,
    longitude,
    radiusMeters: place.radiusMeters,
    aliases: aliases
      .slice()
      .sort((a, b) => a.alias.localeCompare(b.alias))
      .map((row) => row.alias),
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

/** Name + category + aliases, each normalized, as resolution candidates. */
function buildMatchCandidates(
  place: SavedPlace,
): { normalized: string }[] {
  const values = [place.name, place.category ?? '', ...place.aliases];
  const seen = new Set<string>();
  const candidates: { normalized: string }[] = [];
  for (const value of values) {
    const normalized = normalizeAlias(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({ normalized });
  }
  return candidates;
}
