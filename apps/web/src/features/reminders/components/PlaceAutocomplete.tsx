import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type GeoapifyPlaceSuggestion } from '../services/geoapifyPlacesService'

type Props = {
  value: string
  placeholder?: string
  onTextChange: (value: string) => void
  onPlaceSelected: (place: GeoapifyPlaceSuggestion) => void
}

const DEBOUNCE_MS = 300

export function PlaceAutocomplete({ value, placeholder, onTextChange, onPlaceSelected }: Props) {
  const [suggestions, setSuggestions] = useState<GeoapifyPlaceSuggestion[]>([])
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
      searchPlaces(text)
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

  const handleSelect = (suggestion: GeoapifyPlaceSuggestion) => {
    setIsOpen(false)
    onTextChange(suggestion.label)
    onPlaceSelected(suggestion)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] shadow-[0_16px_40px_var(--bp-shadow)]">
          <ul className="divide-y divide-[var(--bp-border)]">
            {suggestions.map((suggestion) => (
              <li key={suggestion.geoapifyPlaceId}>
                <button
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className="block w-full px-4 py-3 text-start transition hover:bg-[var(--bp-accent-soft)]"
                >
                  <p className="text-sm font-semibold text-[var(--bp-text)]">{suggestion.placeName}</p>
                  <p className="text-xs text-[var(--bp-subtle)]">
                    {suggestion.address}
                    {suggestion.city ? ` • ${suggestion.city}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
