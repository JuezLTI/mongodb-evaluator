const { spawn } = require('child_process');

// Escuchar mensajes del proceso principal
process.on('message', async (mensaje) => {
  const consulta = mensaje.consulta;

  try {
    // Conectar a MongoDB utilizando mongosh
    // TODO use custom db
    const conexion = spawn('mongosh', [
      '--host', process.env.MONGO_DB_CONTAINER_NAME,
      '--port', process.env.MONGO_DB_VALIDATOR_PORT,
      'test'
    ]);

    let salidaEstandar = '';
    let salidaError = '';

    // Capturar la salida estándar
    conexion.stdout.on('data', (data) => {
      salidaEstandar += data.toString();
    });

    // Capturar la salida de error
    conexion.stderr.on('data', (data) => {
      salidaError += data.toString();
    });

    // Enviar la consulta al proceso mongosh
    console.log("consulta:", consulta)

    conexion.stdin.write(`${consulta};`);

    conexion.stdin.end();

    // Esperar la salida del proceso mongosh
    conexion.on('close', (codigoSalida) => {
      if (codigoSalida === 0) {
        process.send({ resultado: 'Consulta ejecutada con éxito ', salidaEstandar });
      } else {
        process.send({ error: 'Error al ejecutar la consulta ', salidaError });
      }

      // Finalizar el proceso hijo
      process.exit();
    });
  } catch (error) {
    // Enviar el error al proceso principal
    process.send({ error: error.message });

    // Finalizar el proceso hijo
    process.exit();
  }
});
