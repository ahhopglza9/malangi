// =====================================================================
//  셰이더: 사용자가 준 원본 이미지를 3D 몸통에 "기준 카메라"로 투영해서 입힌다.
//   - 기준 시점에서는 원본 이미지와 똑같이 보임 (색·주름·반짝이·얼굴 모두 원본 그대로)
//   - 눌러서 모양이 바뀌면, 그 변화량만큼만 음영/하이라이트를 더해서 입체감을 표현
// =====================================================================
export const SHADER_SRC = {
  vertex: `
    attribute vec3 aRest;
    attribute vec3 aNRest;
    attribute float aStrain;
    uniform mat4 uRefVP;
    varying vec3 vRefQ;
    varying vec3 vRest;
    varying vec3 vNRest;
    varying vec3 vN;
    varying vec3 vPos;
    varying float vStrain;
    void main(){
      vec4 q = uRefVP * vec4(aRest, 1.0);
      vRefQ = vec3(q.x, q.y, q.w);
      vRest = aRest; vNRest = aNRest; vN = normal; vPos = position; vStrain = aStrain;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    uniform sampler2D uMap;
    uniform sampler2D uMapBack;   // (선택) 실루엣 말랑이의 뒷면 사진
    uniform float uHasBack;
    uniform vec3 uCam;
    uniform vec3 uRefCam;
    uniform vec3 uMapXf;      // (기준 화면에서 몸통 중심 x, y, 픽셀당 NDC 크기)
    uniform vec4 uImg;        // (이미지 폭, 높이, 몸통 중심 px x, y)
    uniform float uTime;
    uniform float uGloss;     // 눌렀을 때 생기는 반짝임 (0 = 없음, 무광)
    uniform float uWhiten;    // 눌려서 얇아진 곳이 뽀얘지는 정도 (0 = 없음)
    uniform float uSphere;    // 1 = 구 말랑이, 2 = 회전체(눈사람 등), 3 = 직육면체(버터 등): 사진이 아니라 구 전개도(가로 360° × 세로 180°)를 몸통에 감싼다
    uniform vec2 uCyl;        // 회전체: (맨 아래 y, 전체 높이)
    uniform vec3 uBox;        // 직육면체: 반쪽 크기 (가로/2, 높이/2, 깊이/2)
    uniform float uSheet;     // 1 = 실루엣(판) 몸통: 뒷면에도 사진을 그대로 입힌다
    uniform float uWaxLit;    // 1 = 사진 없이 색만 있는 왁뿌볼: 은은한 조명 음영과 왁스 광택을 직접 넣는다
    uniform float uWax;       // 1 = 왁뿌볼: 겉면이 조각으로 나뉘어 금이 가고, 깨진 조각은 떨어져 나간다
    uniform vec4 uSites[48];  // 조각 중심(xyz) + 부서진 정도(w: 0~1, 1이면 깨져서 사라짐)
    varying vec3 vRefQ;
    varying vec3 vRest;
    varying vec3 vNRest;
    varying vec3 vN;
    varying vec3 vPos;
    varying float vStrain;

    float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    vec3 h33(vec3 p){ return vec3(h31(p), h31(p+vec3(17.3,3.1,9.7)), h31(p+vec3(41.7,23.9,5.3))); }
    float glit(vec3 p, float scale, float dens, out vec3 rd, out float pick){
      vec3 g = p*scale; vec3 id = floor(g); vec3 f = fract(g);
      vec3 r = h33(id);
      rd = normalize(h33(id + 3.7)*2.0 - 1.0);
      pick = r.y;
      float on = step(1.0 - dens, r.x);
      vec3 c = vec3(0.25) + 0.5*h33(id + 9.1);
      return on*(1.0 - smoothstep(0.10, 0.26, length(f - c)));
    }

    void main(){
      // 왁뿌볼: 가장 가까운 조각(셀)을 찾아서, 깨진 조각은 그리지 않고 금·모서리를 표시한다
      float wxCrack = 0.0, wxRim = 0.0, wxM = 0.0;
      if (uWax > 0.5){
        vec3 dw = normalize(vRest);
        float d1 = 9.0, d2 = 9.0, m1 = 0.0, m2 = 0.0;
        for (int i = 0; i < 48; i++){
          float dd = 1.0 - dot(dw, uSites[i].xyz);
          if (dd < d1){ d2 = d1; m2 = m1; d1 = dd; m1 = uSites[i].w; }
          else if (dd < d2){ d2 = dd; m2 = uSites[i].w; }
        }
        if (m1 >= 1.0) discard;                                            // 부서져 떨어져 나간 조각 → 안쪽 속이 보인다
        float edge = d2 - d1 + (h31(dw*31.0) - 0.5)*0.0015;               // 조각 사이 경계(약간 삐뚤빼뚤)
        float dmg = max(m1, m2);
        float wLine = 0.0007 + 0.011*min(dmg, 1.0);
        wxCrack = (1.0 - smoothstep(0.0, wLine, edge)) * smoothstep(0.04, 0.25, dmg);
        wxRim   = (m2 >= 1.0) ? (1.0 - smoothstep(0.0, 0.006, edge)) : 0.0;   // 이웃 조각이 깨졌으면 그쪽 단면이 밝게 보임
        wxM     = min(m1, 1.0);
      }
      // 기준 카메라로 투영한 위치 → 원본 이미지의 픽셀 좌표
      vec2 ndc = vRefQ.xy / vRefQ.z;
      vec2 px  = uImg.zw + vec2(ndc.x - uMapXf.x, -(ndc.y - uMapXf.y)) / uMapXf.z;
      vec2 uv  = vec2(px.x/uImg.x, 1.0 - px.y/uImg.y);
      if (uSphere > 0.5){                                  // 구 전개도: 경도/위도로 찾는다
        vec3 dr = normalize(vRest);
        if (uSphere > 1.5) dr = normalize(vec3(vRest.x, 0.0, vRest.z + 1e-6));     // 회전체: 세로축을 기준으로 한 각도 + 높이로 찾는다
        float lu  = atan(dr.x, dr.z)/6.2831853 + 0.5;
        float lu2 = fract(lu + 0.5) - 0.5;                 // 이음선(±180°)에서 무늬가 갈라져 보이지 않게 더 매끈한 쪽을 고른다
        float lv  = uSphere > 1.5 ? (vRest.y - uCyl.x)/uCyl.y : asin(clamp(dr.y, -1.0, 1.0))/3.14159265 + 0.5;
        uv = vec2(fwidth(lu) <= fwidth(lu2) ? lu : lu2, lv);
      }
      if (uSphere > 2.5){                                  // 직육면체: 가장 가까운 면을 찾아 그 면의 사진을 붙인다 (3열×2행 아틀라스)
        vec3 pb = vRest / uBox;
        vec3 ab = abs(pb);
        vec2 f; float col; float row;
        if (ab.z >= ab.x && ab.z >= ab.y){
          if (pb.z > 0.0){ col = 0.0; row = 0.0; f = vec2( pb.x, pb.y); } else { col = 1.0; row = 0.0; f = vec2(-pb.x, pb.y); }   // 앞 / 뒤
        } else if (ab.x >= ab.y){
          if (pb.x > 0.0){ col = 2.0; row = 0.0; f = vec2(-pb.z, pb.y); } else { col = 0.0; row = 1.0; f = vec2( pb.z, pb.y); }   // 오른쪽 / 왼쪽
        } else {
          if (pb.y > 0.0){ col = 1.0; row = 1.0; f = vec2(pb.x, -pb.z); } else { col = 2.0; row = 1.0; f = vec2(pb.x, pb.z); }     // 위 / 아래
        }
        f = clamp(f*0.5 + 0.5, 0.012, 0.988);
        uv = vec2((col + f.x)/3.0, 1.0 - (row + (1.0 - f.y))/2.0);
      }        
      vec3 tex  = texture2D(uMap, uv).rgb;
      if (uSheet > 0.5 && uHasBack > 0.5){                 // 앞면/뒷면에 서로 다른 사진: 보는 쪽에 맞는 사진을 고른다
        vec3 texBack = texture2D(uMapBack, uv).rgb;
        vec3 Nq = normalize(vNRest), Vq = normalize(uRefCam - vRest);
        tex = mix(texBack, tex, smoothstep(-0.12, 0.12, dot(Nq, Vq)));
      }
      vec3 mean = texture2D(uMap, uv, 8.0).rgb;            // 이미지 전체의 평균 민트색

      vec3 Nr   = normalize(vNRest);
      vec3 Vref = normalize(uRefCam - vRest);
      float facing = dot(Nr, Vref);
      float wFront = (uSheet > 0.5 || uSphere > 0.5) ? 1.0 : smoothstep(0.05, 0.28, facing);       // 기준 시점에서 옆·뒤로 넘어가는 면은 늘어난 이미지 대신 평균색

      // 뒷면: 평균 민트색 + 원본 느낌의 반짝이
      vec3 Vo = normalize(uCam - vRest);
      vec3 rd; float pk;
      float g1 = glit(vRest, 13.0, 0.30, rd, pk);
      float t1 = (0.25 + 0.95*pow(max(dot(rd, Vo), 0.0), 3.0)) * (0.85 + 0.15*sin(uTime*3.0 + pk*60.0));
      vec3 k1 = mix(vec3(1.0,0.92,0.55), vec3(1.0,1.0,0.95), step(0.6, pk));
      float g2 = glit(vRest - Vo*0.22 + 3.3, 10.0, 0.32, rd, pk);
      float t2 = (0.25 + 0.95*pow(max(dot(rd, Vo), 0.0), 3.0));
      vec3 back = mean*vec3(0.94,0.97,0.94) + k1*g1*t1*0.55 + vec3(0.95,1.0,0.8)*g2*t2*0.25;

      vec3 n = normalize(vN);
      vec3 L  = normalize(vec3(-0.45, 0.85, 0.55));
      back *= 0.80 + 0.30*(dot(n, L)*0.5 + 0.5);            // 뒷면에도 은은한 입체 음영
      vec3 col = mix(back, tex, wFront);
      col = mix(col, vec3(0.97, 0.95, 0.90), 0.30*wxM);            // 금이 갈수록 뽀얗게
      col *= 1.0 - 0.55*wxCrack;                                    // 금(어두운 실선)
      col = mix(col, vec3(1.0, 0.99, 0.95), wxRim*0.8);             // 깨진 단면

      // 눌러서 바뀐 부분만 음영/하이라이트 추가 (정지 상태에서는 0 → 원본 그대로)
      vec3 Vc = normalize(uCam - vPos);
      float dl = dot(n, L) - dot(Nr, L);
      float shadeAmt = uSphere > 0.5 ? 0.5 : 0.85;                 // 구는 사진이 이미 은은하게 조명돼 있어서 음영을 약하게
      float shade = uSphere > 0.5 ? clamp(1.0 + shadeAmt*dl, 0.65, 1.30) : clamp(1.0 + shadeAmt*dl, 0.55, 1.35);
      float vol = uSphere > 0.5 ? 1.0 : 1.0 - 0.35*max(clamp(facing, 0.0, 1.0) - clamp(dot(Nr, Vc), 0.0, 1.0), 0.0);   // 돌려서 기준 시점의 앞면이 옆으로 넘어가면 살짝 어둡게
      vec3 H = normalize(L + Vc);
      float spNow  = pow(max(dot(n,  H), 0.0), 90.0);
      float spRest = pow(max(dot(Nr, H), 0.0), 90.0);
      float wideNow  = pow(max(dot(n,  H), 0.0), 14.0);
      float wideRest = pow(max(dot(Nr, H), 0.0), 14.0);
      float spec = (max(spNow - spRest, 0.0)*0.85 + max(wideNow - wideRest, 0.0)*0.16) * uGloss;

      if (uSheet > 0.5 && uHasBack < 0.5) col *= mix(0.84, 1.0, smoothstep(-0.15, 0.15, facing));    // 뒷면 사진이 없으면 살짝 어둡게
      if (uWaxLit > 0.5){                                           // 왁스 겉면: 부드러운 음영 + 매끈한 광택
        col *= 0.74 + 0.36*max(dot(n, L), 0.0);
        col += vec3(pow(max(dot(n, H), 0.0), 60.0))*0.28*(1.0 - wxCrack);
      }
      col *= shade * vol;
      col = mix(col, vec3(0.90, 1.0, 0.92), vStrain*0.38*uWhiten);    // 눌려서 얇아진 곳은 뽀얗게
      col += vec3(spec);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `
};

// ---- 왁뿌볼: 안쪽의 말랑한 속(왁스가 깨진 자리로 보임) ----
export const CORE_SRC = {
  vertex: `
    uniform float uInset;
    varying vec3 vN;
    varying vec3 vPos;
    void main(){
      vec3 p = position - normal*uInset;                 // 겉면(왁스)보다 살짝 안쪽
      vN = normal; vPos = p;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragment: `
    uniform vec3 uCoreColor;
    uniform vec3 uCam;
    varying vec3 vN;
    varying vec3 vPos;
    void main(){
      vec3 n = normalize(vN);
      vec3 V = normalize(uCam - vPos);
      vec3 L = normalize(vec3(-0.45, 0.85, 0.55));
      float diff = 0.55 + 0.45*max(dot(n, L), 0.0);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);
      float spec = pow(max(dot(n, normalize(L + V)), 0.0), 40.0);
      vec3 col = uCoreColor*diff + vec3(1.0, 0.92, 0.96)*fres*0.22 + vec3(spec)*0.30;
      gl_FragColor = vec4(col, 1.0);
    }
  `
};

// ---- 왁뿌볼: 떨어지는 왁스 부스러기 (점 스프라이트) ----
export const SHARD_SRC = {
  vertex: `
    attribute float aAlpha;
    attribute float aSize;
    attribute float aRot;
    uniform float uPointScale;
    varying float vAlpha;
    varying float vRot;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = max(aSize*uPointScale/(-mv.z), 1.0) * step(0.01, aAlpha);
      vAlpha = aAlpha; vRot = aRot;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: `
    uniform vec3 uShardColor;
    varying float vAlpha;
    varying float vRot;
    void main(){
      vec2 p = gl_PointCoord - 0.5;
      float c = cos(vRot), s = sin(vRot);
      p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
      if (abs(p.x) + abs(p.y)*1.7 > 0.5 || vAlpha < 0.01) discard;      // 뾰족한 조각 모양
      vec3 col = uShardColor * (0.82 + 0.35*(0.5 - p.y));
      gl_FragColor = vec4(col, vAlpha);
    }
  `
};

