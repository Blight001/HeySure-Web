// 旧导入路径兼容；新代码统一从 devices.ts 使用设备命名。
export {
  fetchBuiltinDeviceBindings as fetchWorkshopBindings,
  getLibraryMcpScope,
  setBuiltinDeviceBinding as setWorkshopBinding,
  setLibraryMcpScope,
} from './devices'
export type {
  BuiltinDeviceItem as WorkshopAgentItem,
  LibraryMcpScope,
} from './devices'
