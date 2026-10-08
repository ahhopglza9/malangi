// 셰이더 uniform (말랑이별로 값만 교체) — scene 과 wax 가 같이 쓴다 (uSites 는 scene 이 Wax.sites 로 채움)
export const uCam = { value: null }, uTime = { value: 0 };
export const U = {                                                   // 셰이더 uniform (말랑이별로 값만 교체)
  uMap:{ value:null }, uMapBack:{ value:null }, uHasBack:{ value:0 }, uCam:uCam, uRefCam:{ value:null }, uRefVP:{ value:null },
  uMapXf:{ value:null }, uImg:{ value:null }, uTime:uTime, uSheet:{ value:0 }, uSphere:{ value:0 }, uCyl:{ value:null }, uBox:{ value:null }, uWax:{ value:0 }, uWaxLit:{ value:0 }, uSites:{ value:null }, uGloss:{ value:1 }, uWhiten:{ value:1 }
};
