import { registerRoomExtensions } from '../utils/room-extensions'

export default defineNitroPlugin(() => {
  registerRoomExtensions()
})
