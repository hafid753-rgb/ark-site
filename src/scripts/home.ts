// The demo house: one small state object shared by the 3D scenes, the cloud
// demo and the phone. Changes are announced on `bus`.

export type Room = 'living' | 'bedroom' | 'kitchen' | 'courtyard';
export const ROOMS: Room[] = ['living', 'bedroom', 'kitchen', 'courtyard'];

export const state = {
  lights: { living: false, bedroom: false, kitchen: false, courtyard: false } as Record<Room, boolean>,
  ac: false,
  temp: 24,
  gate: false,
  cloud: true,
};

export const bus = new EventTarget();

export function update(change: (s: typeof state) => void) {
  change(state);
  bus.dispatchEvent(new Event('change'));
}

export const anyLight = () => ROOMS.some((r) => state.lights[r]);
