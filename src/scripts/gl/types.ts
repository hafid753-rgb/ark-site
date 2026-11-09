import type * as THREE from 'three';
import type { GlyphSet } from './glyphs';

export interface FrameInfo {
  time: number;
  dt: number;
  /** 0..1 through the chapter's section, measured at the middle of the screen. */
  p: number;
  el: HTMLElement;
  aspect: number;
  W: number;
  H: number;
  mode?: string;
}

export interface Chapter {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 0 = real image, 1 = drawn in letters. */
  glyph: number;
  /** Exposure for the letters (default 1): dim scenes can lift it so faint things still get letters. */
  gain?: number;
  /** 0..1: the letters pour away (rented things losing their server). */
  fall: number;
  anchors?: THREE.Vector3[];
  anchorAlpha?: number;
  feed?: THREE.Camera | null;
  update(f: FrameInfo): void;
  pick?(ndc: THREE.Vector2): boolean;
}

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  env: THREE.Texture;
  glyphs: GlyphSet;
  rtl: boolean;
  reduced: boolean;
}
