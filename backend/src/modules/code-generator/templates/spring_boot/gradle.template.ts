import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderBuildGradle(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'build-gradle.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    groupId: context.groupId || 'com.app',
    artifactId: context.artifactId || 'spring-boot-uml-api',
    springBootVersion: context.springBootVersion || '3.4.0',
    javaVersion: context.javaVersion || '21',
    hasAuth: context.hasAuth,
  });
}

export function renderSettingsGradle(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'settings-gradle.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    artifactId: context.artifactId || 'spring-boot-uml-api',
  });
}
