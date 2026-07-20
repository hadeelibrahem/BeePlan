import type { MobileIconName } from '../components/layout/MobileIcon';

export type FocusSoundCategory = 'Nature' | 'Environment' | 'Noise' | 'Relax';
export type FocusSound = { id: string; name: string; category: FocusSoundCategory; icon: MobileIconName; audioFile: string };
export const FOCUS_SOUND_CATEGORIES: FocusSoundCategory[] = ['Nature', 'Environment', 'Noise', 'Relax'];
const sound = (id: string, name: string, category: FocusSoundCategory, icon: MobileIconName): FocusSound => ({ id, name, category, icon, audioFile: `assets/focus-sounds/${id}.mp3` });
export const FOCUS_SOUNDS: FocusSound[] = [
  sound('rain', 'Rain', 'Nature', 'reminders'), sound('heavy-rain', 'Heavy Rain', 'Nature', 'reminders'), sound('thunder', 'Thunder', 'Nature', 'priority'), sound('forest', 'Forest', 'Nature', 'focus'), sound('birds', 'Birds', 'Nature', 'people'), sound('ocean-waves', 'Ocean Waves', 'Nature', 'focus'), sound('river', 'River', 'Nature', 'focus'),
  sound('coffee-shop', 'Coffee Shop', 'Environment', 'reminders'), sound('library', 'Library', 'Environment', 'folder'), sound('fireplace', 'Fireplace', 'Environment', 'priority'), sound('fan', 'Fan', 'Environment', 'focus'),
  sound('white-noise', 'White Noise', 'Noise', 'notifications'), sound('brown-noise', 'Brown Noise', 'Noise', 'notifications'), sound('pink-noise', 'Pink Noise', 'Noise', 'notifications'),
  sound('meditation', 'Meditation', 'Relax', 'focus'), sound('soft-piano', 'Soft Piano', 'Relax', 'reminders'), sound('ambient', 'Ambient', 'Relax', 'focus'), sound('lofi', 'Lo-fi', 'Relax', 'focus'),
];
