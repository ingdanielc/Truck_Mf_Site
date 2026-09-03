export const environment = {
  production: false,
  environmentType: 'local',
  _APIUrl: 'https://truck.ccsoluciones.com.co',
  subscription: 'truck-api-key',
  // Llave publica VAPID para notificaciones push. Vacia = push desactivado.
  // Se genera con `npx web-push generate-vapid-keys`; la privada va al backend.
  vapidPublicKey:
    'BINIBeuEWnLvwbDguMuyQrLgTZ3ZmRvX-XEIPCBj245Yq8_AVEI_-0JgEX60xfaOsIj7RRie83zsrzPDf5sRUsk',
  // Requerido por los marcadores avanzados de Google Maps.
  googleMapsMapId: 'DEMO_MAP_ID',
};
