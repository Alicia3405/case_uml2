import * as path from 'path';
import { JavaClassMeta, JavaField } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderCreateDto(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'create-dto.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const imports = buildDtoImports(meta);
  const regularFields = meta.fields.filter((f) => !f.isId && !isForeignKeyField(f, meta));
  const processedFields = regularFields.map((f) => ({
    ...f,
    isNotBlank: !f.isNullable && f.javaType === 'String',
    isNotNull: !f.isNullable && f.javaType !== 'String',
  }));
  const fkFields = buildDtoForeignKeyFields(meta);

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    imports,
    processedFields,
    fkFields,
  });
}

export function renderUpdateDto(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'update-dto.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const imports = buildDtoImports(meta);
  const regularFields = meta.fields.filter((f) => !f.isId && !isForeignKeyField(f, meta));
  const fkFields = buildDtoForeignKeyFields(meta);

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    imports,
    processedFields: regularFields,
    fkFields,
  });
}

export function renderResponseDto(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'response-dto.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const imports = [
    'java.util.UUID',
    `${meta.basePackage}.entities.${meta.className}`,
  ];
  if (meta.hasBigDecimals) imports.push('java.math.BigDecimal');
  if (meta.hasDates) imports.push('java.time.LocalDate', 'java.time.LocalDateTime');

  const sortedImports = Array.from(new Set(imports)).sort();

  // Excluir campos de contraseña y de claves foráneas del DTO de respuesta
  const responseFields = meta.fields.filter(
    (f) =>
      !isForeignKeyField(f, meta) &&
      f.name.toLowerCase() !== 'password' &&
      f.name.toLowerCase() !== 'contrasena' &&
      f.name.toLowerCase() !== 'contraseña' &&
      f.name.toLowerCase() !== 'clave' &&
      f.name.toLowerCase() !== 'pass' &&
      f.name.toLowerCase() !== 'pwd',
  );

  const fkFields: { fieldName: string; capFieldName: string; idType: string; targetIdGetterName: string }[] = [];
  const seen = new Set<string>();
  for (const rel of meta.relationships) {
    if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
      if (!seen.has(rel.fieldName)) {
        seen.add(rel.fieldName);
        fkFields.push({
          fieldName: rel.fieldName,
          capFieldName: rel.fieldName.charAt(0).toUpperCase() + rel.fieldName.slice(1),
          idType: rel.targetIdType || 'UUID',
          targetIdGetterName: rel.targetIdGetterName || 'getId',
        });
      }
    }
  }

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    imports: sortedImports,
    processedFields: responseFields,
    fkFields,
  });
}

function isForeignKeyField(field: JavaField, meta: JavaClassMeta): boolean {
  if (field.isForeignKey) return true;
  return meta.relationships.some(
    (r) =>
      (r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE') &&
      r.joinColumnName?.toLowerCase() === field.sqlColumnName.toLowerCase(),
  );
}

function buildDtoImports(meta: JavaClassMeta): string[] {
  const imports: string[] = [
    'java.util.UUID',
    'jakarta.validation.constraints.*',
  ];

  if (meta.hasBigDecimals) {
    imports.push('java.math.BigDecimal');
  }
  if (meta.hasDates) {
    imports.push('java.time.LocalDate', 'java.time.LocalDateTime');
  }

  return Array.from(new Set(imports)).sort();
}

function buildDtoForeignKeyFields(meta: JavaClassMeta): { fieldName: string; idType: string }[] {
  const result: { fieldName: string; idType: string }[] = [];
  const seen = new Set<string>();

  for (const rel of meta.relationships) {
    if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
      if (!seen.has(rel.fieldName)) {
        seen.add(rel.fieldName);
        result.push({
          fieldName: rel.fieldName,
          idType: rel.targetIdType || 'UUID',
        });
      }
    }
  }

  return result;
}
