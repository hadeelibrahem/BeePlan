import { useEffect, useRef, useState } from 'react'
import { autocompletePlaces, getPlaceDetails, type PlaceSuggestion } from '../../../lib/geoapify'

export type PlaceSelection = {
  placeName: string
  address?: string
  latitude: number
  longitude: number
}

type Props = {
  value: string
  placeholder?: string
  className?: string
  onTextChange: (value: string) => void
  onPlaceSelected: (place: PlaceSelection) => void
}

const DEBOUNCE_MS = 350

export function PlacesAutocompleteInput({
  value,
  placeholder,
  className,
  onTextChange,
  onPlaceSelected,
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleTextChange = (text: string) => {
    onTextChange(text)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!text.trim()) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      autocompletePlaces(text)
        .then((results) => {
          setSuggestions(results)
          setIsOpen(results.length > 0)
        })
        .catch((error: unknown) => {
          console.error(error)
          setSuggestions([])
          setIsOpen(false)
        })
    }, DEBOUNCE_MS)
  }

  const handleSelect = (suggestion: PlaceSuggestion) => {
    setIsOpen(false)
    onTextChange(suggestion.label)

    getPlaceDetails(suggestion.placeId)
      .then((details) => onPlaceSelected(details))
      .catch((error: unknown) => console.error(error))
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] shadow-[0_16px_40px_var(--bp-shadow)]">
          <ul className="divide-y divide-[var(--bp-border)]">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--bp-text)] transition hover:bg-[var(--bp-accent-soft)] hover:text-[var(--bp-accent)]"
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
