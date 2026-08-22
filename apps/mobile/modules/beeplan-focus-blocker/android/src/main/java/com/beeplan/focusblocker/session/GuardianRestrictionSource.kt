package com.beeplan.focusblocker.session

import org.json.JSONArray
import org.json.JSONObject

data class GuardianRestrictionSource(val sourceId: String, val packages: Set<String>, val endsAtMs: Long) {
  fun toJson() = JSONObject().put("sourceId", sourceId).put("packages", JSONArray(packages.toList())).put("endsAtMs", endsAtMs)
  companion object { fun fromJson(json: JSONObject) = GuardianRestrictionSource(json.getString("sourceId"), json.getJSONArray("packages").let { values -> (0 until values.length()).map { values.getString(it) }.toSet() }, json.getLong("endsAtMs")) }
}

class GuardianRestrictionStore(context: android.content.Context) {
  private val prefs = context.getSharedPreferences("beeplan.guardian_restrictions", android.content.Context.MODE_PRIVATE)
  fun load(): List<GuardianRestrictionSource> = runCatching { val data = JSONArray(prefs.getString("sources", "[]")); (0 until data.length()).map { GuardianRestrictionSource.fromJson(data.getJSONObject(it)) } }.getOrDefault(emptyList())
  fun save(sources: Collection<GuardianRestrictionSource>) { prefs.edit().putString("sources", JSONArray(sources.map { it.toJson() }).toString()).apply() }
}
