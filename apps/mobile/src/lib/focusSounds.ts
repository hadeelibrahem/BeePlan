export type FocusSoundCategory = 'Nature' | 'Environment' | 'Noise' | 'Relax';

export type FocusSound = {
  id: string;
  name: string;
  category: FocusSoundCategory;
  icon: string;
  audioFile: string;
};

export const FOCUS_SOUND_CATEGORIES: FocusSoundCategory[] = [
  'Nature',
  'Environment',
  'Noise',
  'Relax',
];

export const FOCUS_SOUNDS: FocusSound[] = [
  { id: 'rain', name: 'Rain', category: 'Nature', icon: '🌧', audioFile: 'assets/focus-sounds/rain.mp3' },
  { id: 'heavy-rain', name: 'Heavy Rain', category: 'Nature', icon: '🌧', audioFile: 'assets/focus-sounds/heavy-rain.mp3' },
  { id: 'thunder', name: 'Thunder', category: 'Nature', icon: '⛈', audioFile: 'assets/focus-sounds/thunder.mp3' },
  { id: 'forest', name: 'Forest', category: 'Nature', icon: '🌲', audioFile: 'assets/focus-sounds/forest.mp3' },
  { id: 'birds', name: 'Birds', category: 'Nature', icon: '🐦', audioFile: 'assets/focus-sounds/birds.mp3' },
  { id: 'ocean-waves', name: 'Ocean Waves', category: 'Nature', icon: '🌊', audioFile: 'assets/focus-sounds/ocean-waves.mp3' },
  { id: 'river', name: 'River', category: 'Nature', icon: '🏞', audioFile: 'assets/focus-sounds/river.mp3' },
  { id: 'coffee-shop', name: 'Coffee Shop', category: 'Environment', icon: '☕', audioFile: 'assets/focus-sounds/coffee-shop.mp3' },
  { id: 'library', name: 'Library', category: 'Environment', icon: '📚', audioFile: 'assets/focus-sounds/library.mp3' },
  { id: 'fireplace', name: 'Fireplace', category: 'Environment', icon: '🔥', audioFile: 'assets/focus-sounds/fireplace.mp3' },
  { id: 'fan', name: 'Fan', category: 'Environment', icon: '🌀', audioFile: 'assets/focus-sounds/fan.mp3' },
  { id: 'white-noise', name: 'White Noise', category: 'Noise', icon: '📻', audioFile: 'assets/focus-sounds/white-noise.mp3' },
  { id: 'brown-noise', name: 'Brown Noise', category: 'Noise', icon: '🔊', audioFile: 'assets/focus-sounds/brown-noise.mp3' },
  { id: 'pink-noise', name: 'Pink Noise', category: 'Noise', icon: '🎚', audioFile: 'assets/focus-sounds/pink-noise.mp3' },
  { id: 'meditation', name: 'Meditation', category: 'Relax', icon: '🧘', audioFile: 'assets/focus-sounds/meditation.mp3' },
  { id: 'soft-piano', name: 'Soft Piano', category: 'Relax', icon: '🎹', audioFile: 'assets/focus-sounds/soft-piano.mp3' },
  { id: 'ambient', name: 'Ambient', category: 'Relax', icon: '🎧', audioFile: 'assets/focus-sounds/ambient.mp3' },
  { id: 'lofi', name: 'Lo-fi', category: 'Relax', icon: '🎧', audioFile: 'assets/focus-sounds/lofi.mp3' },
];
