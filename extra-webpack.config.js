const singleSpaAngularWebpack = require('single-spa-angular/lib/webpack').default;

module.exports = (config, options) => {
  const singleSpaWebpackConfig = singleSpaAngularWebpack(config, options);

  // Hash de contenido en los chunks perezosos, solo en compilaciones de
  // produccion.
  //
  // `main.js` conserva su nombre a proposito: es la URL fija que SystemJS
  // importa desde el shell, y cambiarla romperia el registro de la aplicacion.
  // Por eso se toca `chunkFilename` y nunca `filename`.
  //
  // El problema que resuelve: con `outputHashing: "none"` cada compilacion
  // reescribe `37.js`, `715.js` y compania con contenido distinto bajo el mismo
  // nombre. Un navegador que tenga el chunk viejo en cache puede combinarlo con
  // un `main.js` nuevo, y los identificadores de modulo ya no coinciden. Con
  // hash, cada compilacion pide URLs nuevas y esa mezcla no puede ocurrir.
  //
  // Ojo con el despliegue: el directorio no debe vaciarse al publicar. Si se
  // borran los chunks de la version anterior, una pestana abierta desde antes
  // recibe 404 al entrar a una ruta perezosa. Basta con copiar encima.
  if (singleSpaWebpackConfig.mode === 'production') {
    singleSpaWebpackConfig.output.chunkFilename = '[name].[contenthash:20].js';
  }

  return singleSpaWebpackConfig;
};
