import{N as e,Z as t,dn as n,dt as r,fn as i,jn as a,lt as o,nt as s,u as c}from"./three.core.Bn5IdJvN.js";import{a as l,i as u,r as d,s as f}from"./stage.BWePN1LF.js";var p=Math.PI/180;function m(m){let h=new n;h.environment=m.env,h.background=new c(0);let g=new o(32,1,.05,100),_=new s({color:13618374,metalness:1,roughness:.26,envMapIntensity:.72}),[v,y]=l(.55),b=new t(v,_),x=new t(y,_),S=new e;S.add(b,x),h.add(S);let C=new t(new r(40,40),new i({uniforms:{uTime:{value:0},uLetters:{value:1}},vertexShader:`varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
        uniform float uTime, uLetters; // uLetters: 1 while drawn in letters, 0 once flooded to 3D
        varying vec2 vPos;
        // The mark's two blocks, centred on the window (y up), clockwise.
        const vec2 A[5] = vec2[5](vec2(-1.0, 1.5), vec2(1.17, 1.5), vec2(2.0, 0.67), vec2(2.0, -0.5), vec2(-1.0, -0.5));
        const vec2 B[5] = vec2[5](vec2(-2.0, 0.5), vec2(1.0, 0.5), vec2(1.0, -1.5), vec2(-1.17, -1.5), vec2(-2.0, -0.67));
        // Mitred distance to a convex polygon, and the outward direction of the edge that decides it.
        float block(vec2 p, vec2 v[5], out vec2 n) {
          float d = -1e9;
          for (int i = 0; i < 5; i++) {
            vec2 e = normalize(v[(i + 1) % 5] - v[i]);
            vec2 m = vec2(-e.y, e.x);
            float s = dot(p - v[i], m);
            if (s > d) { d = s; n = m; }
          }
          return d;
        }
        // Across one glass ribbon: u from -1 to 1. Returns the light it throws back.
        float glassAt(float u, vec2 g) {
          float h = sqrt(max(1.0 - u * u, 0.0));
          vec3 N = normalize(vec3(g * (-u / max(h, 0.12)) * 0.8, 1.0));
          float fres = pow(1.0 - N.z, 2.2);
          float spec = pow(max(dot(N, normalize(vec3(-0.45, 0.65, 1.6))), 0.0), 70.0);
          float inside = 1.0 - smoothstep(0.85, 1.0, abs(u));
          return (0.05 + fres * 0.85 + spec * 1.6) * inside;
        }
        void main() {
          vec2 na, nb;
          float da = block(vPos, A, na), db = block(vPos, B, nb);
          float d = min(da, db);
          vec2 g = da < db ? na : nb;
          // A slow liquid wobble, then ripples flowing outward.
          d += 0.05 * sin(vPos.x * 1.3 + uTime * 0.6) * sin(vPos.y * 1.1 - uTime * 0.45);
          float t = d / 0.62 - uTime * 0.16;
          // Letters need wider, brighter ribbons than eyes do.
          float u = (fract(t) - 0.5) / mix(0.17, 0.26, uLetters);
          // Dispersion: each colour sees the ribbon a little wider or narrower.
          vec3 col = vec3(glassAt(u * 1.07, g), glassAt(u, g), glassAt(u * 0.93, g));
          col *= vec3(0.86, 0.93, 1.0);
          // In letters the outer ripples fade sooner, so the words beside them stay easy to read.
          float fade = smoothstep(0.15, 0.6, d) * (1.0 - smoothstep(mix(5.5, 3.2, uLetters), mix(9.5, 6.0, uLetters), d));
          gl_FragColor = vec4(col * fade * mix(0.55, 1.6, uLetters), 1.0);
        }
      `,depthWrite:!1}));C.position.z=-.9,S.add(C);let w=new a,T=-1;return{scene:h,camera:g,glyph:1,gain:2.2,lens:1,fall:0,focus:w,update(e){T<0&&(T=e.time);let t=m.reduced?1:d((e.time-T)/1.8);b.position.set((1-t)*4.5,(1-t)*.8,(1-t)*2),x.position.set(-(1-t)*4.5,-(1-t)*.8,-(1-t)*2);let n=e.aspect>1.05,r=f(.5,1,e.p),i=m.rtl?-1:1;S.position.set(u(n?2.9*i:0,0,r),u(n?0:1.9,0,r),0),S.rotation.set(u(-.1+Math.sin(e.time*.23)*.05,0,r),u(Math.sin(e.time*.3)*.22-.16*i,0,r),0);let a=2*Math.atan(Math.tan(16*p)*e.aspect),o=n?14:Math.max(13,2.7/Math.tan(a/2));g.aspect=e.aspect,g.position.set(0,0,u(o,.5,r*r)),g.updateProjectionMatrix();let s=C.material.uniforms;s.uTime.value=e.time,s.uLetters.value=1-(e.real??0),S.updateMatrixWorld(),S.localToWorld(w.set(.4,1,.3))}}}export{m as create};