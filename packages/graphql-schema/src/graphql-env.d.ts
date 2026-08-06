/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
    'Boolean': unknown;
    'ID': unknown;
    'Mutation': { kind: 'OBJECT'; name: 'Mutation'; fields: { 'createShow': { name: 'createShow'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Show'; ofType: null; }; } }; 'deleteShow': { name: 'deleteShow'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; 'renameShow': { name: 'renameShow'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Show'; ofType: null; }; } }; 'updateUserSettings': { name: 'updateUserSettings'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'UserSettings'; ofType: null; }; } }; }; };
    'Query': { kind: 'OBJECT'; name: 'Query'; fields: { 'me': { name: 'me'; type: { kind: 'OBJECT'; name: 'User'; ofType: null; } }; 'show': { name: 'show'; type: { kind: 'OBJECT'; name: 'Show'; ofType: null; } }; 'shows': { name: 'shows'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Show'; ofType: null; }; }; }; } }; 'userSettings': { name: 'userSettings'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'UserSettings'; ofType: null; }; } }; }; };
    'Show': { kind: 'OBJECT'; name: 'Show'; fields: { 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'updatedAt': { name: 'updatedAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
    'String': unknown;
    'User': { kind: 'OBJECT'; name: 'User'; fields: { 'email': { name: 'email'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'emailVerified': { name: 'emailVerified'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
    'UserSettings': { kind: 'OBJECT'; name: 'UserSettings'; fields: { 'themeMode': { name: 'themeMode'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'themePalette': { name: 'themePalette'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: 'Mutation';
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection
  }
}