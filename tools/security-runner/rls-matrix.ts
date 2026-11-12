/**
 * tools/security-runner/rls-matrix.ts
 *
 * Matriz de casos de prueba de Row Level Security (RLS) y Storage,
 * preparada para ejecución futura con identidades independientes y JWTs reales.
 */

import { SEED_ENTITIES } from './constants.ts';

export interface RlsTestCase {
  id: string;
  category: 'TENANT_ISOLATION' | 'ROLE_RESTRICTION' | 'PORTAL_BOUNDARY' | 'STORAGE_PATH' | 'PUBLIC_DENIAL';
  actorKey: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  table: string;
  targetRecordId: string;
  endpointQuery: string;
  expectedHttpStatus: number;
  expectedRowCount: number;
  assertionDescription: string;
}

export const RLS_TEST_MATRIX: RlsTestCase[] = [
  {
    id: 'RLS-01',
    category: 'TENANT_ISOLATION',
    actorKey: 'A',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,organization_id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 1,
    assertionDescription: 'Owner A en Org Alfa puede leer ticket 101 de su propia organización',
  },
  {
    id: 'RLS-02',
    category: 'TENANT_ISOLATION',
    actorKey: 'A',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t201,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t201}&select=id,organization_id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Owner A en Org Alfa recibe array vacío al intentar leer ticket 201 de Org Beta',
  },
  {
    id: 'RLS-03',
    category: 'ROLE_RESTRICTION',
    actorKey: 'B',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t201,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t201}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 1,
    assertionDescription: 'Técnico interno B puede leer ticket 201 en Org Beta donde está asignado',
  },
  {
    id: 'RLS-04',
    category: 'ROLE_RESTRICTION',
    actorKey: 'B',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t202,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t202}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Técnico interno B recibe array vacío al intentar leer ticket 202 no asignado',
  },
  {
    id: 'RLS-05',
    category: 'TENANT_ISOLATION',
    actorKey: 'B',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Técnico interno B en Org Beta recibe array vacío al consultar ticket de Org Alfa',
  },
  {
    id: 'RLS-06',
    category: 'PORTAL_BOUNDARY',
    actorKey: 'C',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,client_id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 1,
    assertionDescription: 'Usuario portal C puede leer ticket 101 perteneciente a su cliente C1',
  },
  {
    id: 'RLS-07',
    category: 'PORTAL_BOUNDARY',
    actorKey: 'C',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t102,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t102}&select=id,client_id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Usuario portal C recibe array vacío al consultar ticket 102 de otro cliente en su org',
  },
  {
    id: 'RLS-08',
    category: 'PORTAL_BOUNDARY',
    actorKey: 'C',
    table: 'ticket_comments',
    targetRecordId: SEED_ENTITIES.comments.c101Priv,
    endpointQuery: `GET /rest/v1/ticket_comments?id=eq.${SEED_ENTITIES.comments.c101Priv}&select=id,visibility,body`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Usuario portal C recibe array vacío al intentar leer comentario privado (internal)',
  },
  {
    id: 'RLS-09',
    category: 'PORTAL_BOUNDARY',
    actorKey: 'C',
    table: 'devices',
    targetRecordId: SEED_ENTITIES.devices.d1,
    endpointQuery: `GET /rest/v1/devices?id=eq.${SEED_ENTITIES.devices.d1}&select=id,device_name`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Usuario portal C recibe array vacío al consultar dispositivos (solo staff interno)',
  },
  {
    id: 'RLS-10',
    category: 'ROLE_RESTRICTION',
    actorKey: 'D',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 1,
    assertionDescription: 'Técnico externo D puede leer ticket 101 de su organización donde está asignado',
  },
  {
    id: 'RLS-11',
    category: 'ROLE_RESTRICTION',
    actorKey: 'D',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t102,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t102}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Técnico externo D recibe array vacío al consultar ticket 102 no asignado',
  },
  {
    id: 'RLS-12',
    category: 'ROLE_RESTRICTION',
    actorKey: 'D',
    table: 'ticket_comments',
    targetRecordId: SEED_ENTITIES.comments.c101Priv,
    endpointQuery: `GET /rest/v1/ticket_comments?id=eq.${SEED_ENTITIES.comments.c101Priv}&select=id,visibility,body`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Técnico externo D recibe array vacío al leer comentario interno de su ticket asignado',
  },
  {
    id: 'RLS-13',
    category: 'ROLE_RESTRICTION',
    actorKey: 'D',
    table: 'remote_sessions',
    targetRecordId: SEED_ENTITIES.sessions.s102,
    endpointQuery: `GET /rest/v1/remote_sessions?id=eq.${SEED_ENTITIES.sessions.s102}&select=id,status`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Técnico externo D recibe array vacío al consultar su propia sesión 102 (H-17)',
  },
  {
    id: 'RLS-14',
    category: 'ROLE_RESTRICTION',
    actorKey: 'E',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Usuario suspendido E recibe array vacío al consultar tickets de su organización',
  },
  {
    id: 'RLS-15',
    category: 'PUBLIC_DENIAL',
    actorKey: 'F',
    table: 'tickets',
    targetRecordId: SEED_ENTITIES.tickets.t101,
    endpointQuery: `GET /rest/v1/tickets?id=eq.${SEED_ENTITIES.tickets.t101}&select=id,subject`,
    expectedHttpStatus: 200,
    expectedRowCount: 0,
    assertionDescription: 'Actor huérfano F autenticado sin tenant recibe array vacío puro vía RLS',
  },
];

export const STORAGE_SECURITY_SPEC = {
  bucketName: 'ticket-attachments-private',
  isPrivate: true,
  scopingRule: 'storage_path LIKE organization_id || "/%"',
  testCases: [
    {
      id: 'STO-01',
      description: 'Acceso a metadatos de adjunto con visibility=client por miembro del portal C',
      table: 'ticket_attachments',
      targetId: SEED_ENTITIES.attachments.att101Pub,
      expectedAllowed: true,
    },
    {
      id: 'STO-02',
      description: 'Acceso denegado a adjunto con visibility=internal para miembro del portal C',
      table: 'ticket_attachments',
      targetId: SEED_ENTITIES.attachments.att101Priv,
      expectedAllowed: false,
    },
    {
      id: 'STO-03',
      description: 'Acceso denegado entre organizaciones: Técnico B no puede leer adjunto de Org Alfa',
      table: 'ticket_attachments',
      targetId: SEED_ENTITIES.attachments.att101Pub,
      expectedAllowed: false,
    },
  ],
};
