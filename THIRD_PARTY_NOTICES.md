# Third-party notices

## LiquidGlass

The liquid-glass optics in `src/scripts/gl/glyphs.ts` (headlines and panels) are adapted from
[LiquidGlass](https://github.com/ybouane/liquidglass) by [@ybouane](https://github.com/ybouane),
published under the MIT License. The repository states "MIT" without a copyright line,
so the notice below names the author by their handle.

```
MIT License

Copyright (c) ybouane

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## gl-transitions

The transition between chapters (`src/scripts/gl/glyphs.ts`, `transitionMaterial`) is adapted from
`Pixelize.glsl` in [gl-transitions](https://github.com/gl-transitions/gl-transitions) (author gre),
published under the MIT License:

```
MIT License

Copyright (c) 2017-present gl-transitions contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## shaders (Shader Effects Inc.)

An earlier version of the chapter transition followed the model of the `FlutedGlass` effect in [shaders](https://github.com/shader-effects-inc/shaders):
repeating rounded bars that refract what is behind them, with a highlight on each bar. The library
itself is not bundled (it targets WebGPU); the effect was rewritten in GLSL for this site's WebGL 2
compositor. Published under the MIT License:

```
MIT License

Copyright (c) 2026 Shader Effects Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 3D models (Khronos glTF Sample Assets)

From [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets), reduced to
their geometry (textures and other attributes removed, simplified, quantized) for `public/models/`:

- `speaker.glb`: **BoomBox**, CC0 1.0 (public domain dedication).
- `lamp.glb`: **LightsPunctualLamp**, © 2021 DGG, licensed under
  [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Modified
  (geometry only, simplified).
