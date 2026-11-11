import { ProjectContext, toSnakeCase } from './spring_boot/template-models';

export function renderPostmanCollection(context: ProjectContext): string {
  const baseUrl = `http://localhost:${context.serverPort || 8080}/api/v1`;

  const items = context.classes.map((meta) => {
    const endpointPath = toSnakeCase(meta.className);
    const entityUrl = `${baseUrl}/${endpointPath}`;

    // Generar cuerpo mock para POST
    const createBodyObj: Record<string, any> = {};
    const updateBodyObj: Record<string, any> = {};

    for (const f of meta.fields) {
      if (f.isId) continue;
      const type = (f.javaType || 'String').toLowerCase();
      let val: any = 'Ejemplo ' + f.name;
      if (type.includes('long') || type.includes('int')) val = 10;
      else if (type.includes('double') || type.includes('bigdecimal') || type.includes('float')) val = 25.50;
      else if (type.includes('bool')) val = true;
      else if (type.includes('date')) val = '2026-09-23';

      createBodyObj[f.name] = val;
      updateBodyObj[f.name] = typeof val === 'string' ? val + ' Modificado' : val + 5;
    }

    return {
      name: meta.className,
      item: [
        {
          name: `1. Listar ${meta.className} (READ ALL)`,
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: entityUrl,
              protocol: 'http',
              host: ['localhost'],
              port: `${context.serverPort || 8080}`,
              path: ['api', 'v1', endpointPath],
            },
            description: `Recupera la lista completa de todos los registros de ${meta.className}. Retorna HTTP 200 OK.`,
          },
        },
        {
          name: `2. Obtener ${meta.className} por ID (READ ONE)`,
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: `${entityUrl}/1`,
              protocol: 'http',
              host: ['localhost'],
              port: `${context.serverPort || 8080}`,
              path: ['api', 'v1', endpointPath, '1'],
            },
            description: `Busca un registro individual de ${meta.className} por su identificador primario. Retorna HTTP 200 OK o 404 NOT FOUND.`,
          },
        },
        {
          name: `3. Crear ${meta.className} (CREATE)`,
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify(createBodyObj, null, 2),
              options: { raw: { language: 'json' } },
            },
            url: {
              raw: entityUrl,
              protocol: 'http',
              host: ['localhost'],
              port: `${context.serverPort || 8080}`,
              path: ['api', 'v1', endpointPath],
            },
            description: `Inserta un nuevo registro de ${meta.className} en la base de datos PostgreSQL. Retorna HTTP 201 CREATED.`,
          },
        },
        {
          name: `4. Actualizar ${meta.className} (UPDATE)`,
          request: {
            method: 'PUT',
            header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify(updateBodyObj, null, 2),
              options: { raw: { language: 'json' } },
            },
            url: {
              raw: `${entityUrl}/1`,
              protocol: 'http',
              host: ['localhost'],
              port: `${context.serverPort || 8080}`,
              path: ['api', 'v1', endpointPath, '1'],
            },
            description: `Actualiza los campos de un registro existente de ${meta.className}. Retorna HTTP 200 OK o 404 NOT FOUND.`,
          },
        },
        {
          name: `5. Eliminar ${meta.className} (DELETE)`,
          request: {
            method: 'DELETE',
            header: [],
            url: {
              raw: `${entityUrl}/1`,
              protocol: 'http',
              host: ['localhost'],
              port: `${context.serverPort || 8080}`,
              path: ['api', 'v1', endpointPath, '1'],
            },
            description: `Elimina de forma permanente o en cascada el registro con ID especificado de ${meta.className}. Retorna HTTP 204 NO CONTENT.`,
          },
        },
      ],
    };
  });

  const collection = {
    info: {
      name: `${context.projectName} - Postman CRUD Suite v2.1`,
      description: `Colección de pruebas automáticas con operaciones CRUD (Create, Read, Update, Delete) autogenerada por CASE Studio AI para ${context.projectName}.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
  };

  return JSON.stringify(collection, null, 2);
}
