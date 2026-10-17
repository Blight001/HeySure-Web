export const applyJoystickDeadZone = (point: { x: number; y: number }, deadZone = 0) =>
  Math.hypot(point.x, point.y) < deadZone ? { x: 0, y: 0 } : point
