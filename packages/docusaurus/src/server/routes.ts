/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {genChunkName} from '@docusaurus/utils';
import _ from 'lodash';
import {stringify} from 'querystring';
import {
  ChunkRegistry,
  Module,
  RouteConfig,
  RouteModule,
  ChunkNames,
} from '@docusaurus/types';

function isModule(value: any): value is Module {
  if (_.isString(value)) {
    return true;
  }
  if (
    _.isPlainObject(value) &&
    _.has(value, '__import') &&
    _.has(value, 'path')
  ) {
    return true;
  }
  return false;
}

function getModulePath(target: Module): string {
  if (typeof target === 'string') {
    return target;
  }
  const queryStr = target.query ? `?${stringify(target.query)}` : '';
  return `${target.path}${queryStr}`;
}

export async function loadRoutes(pluginsRouteConfigs: RouteConfig[]) {
  const routesImports = [
    `import React from 'react';`,
    `import ComponentCreator from '@docusaurus/ComponentCreator';`,
  ];
  const registry: {
    [chunkName: string]: ChunkRegistry;
  } = {};
  const routesPaths: string[] = ['404.html'];
  const routesChunkNames: {
    [routePath: string]: ChunkNames;
  } = {};

  // This is the higher level overview of route code generation
  function generateRouteCode(routeConfig: RouteConfig): string {
    const {
      path: routePath,
      component,
      modules = {},
      routes,
      exact,
    } = routeConfig;

    if (!_.isString(routePath) || !component) {
      throw new Error(
        `Invalid routeConfig (Path must be a string and component is required) \n${JSON.stringify(
          routeConfig,
        )}`,
      );
    }

    if (!routes) {
      routesPaths.push(routePath);
    }

    function genRouteChunkNames(
      value: RouteModule | RouteModule[] | Module | null | undefined,
      prefix?: string,
      name?: string,
    ) {
      if (!value) {
        return null;
      }

      if (_.isArray(value)) {
        return value.map((val, index) =>
          genRouteChunkNames(val, `${index}`, name),
        );
      }

      if (isModule(value)) {
        const modulePath = getModulePath(value);
        const chunkName = genChunkName(modulePath, prefix, name);
        const loader = `() => import(/* webpackChunkName: '${chunkName}' */ "${modulePath}")`;

        registry[chunkName] = {
          loader,
          modulePath,
        };
        return chunkName;
      }

      const newValue: ChunkNames = {};
      Object.keys(value).forEach(key => {
        newValue[key] = genRouteChunkNames(value[key], key, name);
      });
      return newValue;
    }

    routesChunkNames[routePath] = _.assign(
      routesChunkNames[routePath],
      genRouteChunkNames({component}, 'component', component),
      genRouteChunkNames(modules, 'module', routePath),
    );

    const routesStr = routes
      ? `routes: [${routes.map(generateRouteCode).join(',')}],`
      : '';
    const exactStr = exact ? `exact: true,` : '';

    return `
{
  path: '${routePath}',
  component: ComponentCreator('${routePath}'),
  ${exactStr}
  ${routesStr}
}`;
  }

  const routes = pluginsRouteConfigs.map(generateRouteCode);
  const notFoundRoute = `
  {
    path: '*',
    component: ComponentCreator('*')
  }`;

  const routesConfig = `
${routesImports.join('\n')}

export default [
  ${routes.join(',')},
  ${notFoundRoute}
];\n`;

  return {
    registry,
    routesConfig,
    routesChunkNames,
    routesPaths,
  };
}
