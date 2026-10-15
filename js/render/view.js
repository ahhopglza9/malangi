// 그림자가 퍼질 공간을 주려고 캔버스를 보이는 영역(stage)보다 넓게 깐다.
// 말랑이는 원래 크기로 보이도록 카메라를 stage/캔버스 비율만큼 당긴다 (camera.zoom)
export function bleedZoom(stageWidth, canvasWidth){
  return stageWidth > 0 && canvasWidth > 0 ? stageWidth/canvasWidth : 1;
}
