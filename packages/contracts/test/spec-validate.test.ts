import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * Structural-invariant tests for `packages/contracts/openapi.yaml`.
 *
 * `redocly lint` covers OpenAPI well-formedness; these tests cover the
 * project-specific rules from `CLAUDE.md` that lint cannot enforce:
 *
 *   - every operation has `operationId`, `summary`, and `tags`
 *   - every mutating operation accepts `Idempotency-Key`
 *     (catches the BLOCKER from the Phase-11 platform audit)
 *   - every operation references the shared `ErrorResponse` envelope
 *     in its 4xx/5xx responses (directly via $ref to the schema, OR
 *     transitively via the `Error` / `IdempotencyConflict` response refs).
 */

const SPEC_PATH = resolve(__dirname, '..', 'openapi.yaml');

interface OperationObject {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: ParameterRef[];
  responses?: Record<string, ResponseObject>;
}

interface ParameterRef {
  $ref?: string;
  name?: string;
  in?: string;
}

interface ResponseObject {
  $ref?: string;
  content?: Record<
    string,
    {
      schema?: SchemaRef;
    }
  >;
}

interface SchemaRef {
  $ref?: string;
  oneOf?: SchemaRef[];
  anyOf?: SchemaRef[];
  allOf?: SchemaRef[];
}

interface PathItemObject {
  parameters?: ParameterRef[];
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  trace?: OperationObject;
}

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, PathItemObject>;
  components?: {
    parameters?: Record<string, ParameterRef>;
    responses?: Record<string, ResponseObject>;
    schemas?: Record<string, unknown>;
  };
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
] as const satisfies readonly (keyof PathItemObject)[];

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const ERROR_RESPONSE_SCHEMA_REF = '#/components/schemas/ErrorResponse';
const IDEMPOTENCY_CONFLICT_SCHEMA_REF =
  '#/components/schemas/IdempotencyConflictResponse';

function loadSpec(): OpenApiDocument {
  const raw = readFileSync(SPEC_PATH, 'utf8');
  const doc = parseYaml(raw) as OpenApiDocument;
  return doc;
}

const spec = loadSpec();

/**
 * Walk a parameter list and resolve `$ref` entries against
 * `components.parameters`. Returns the resolved Parameter Objects.
 */
function resolveParameters(
  params: ParameterRef[] | undefined,
  doc: OpenApiDocument,
): ParameterRef[] {
  if (!params) return [];
  const components = doc.components?.parameters ?? {};
  return params.map((p) => {
    if (p.$ref?.startsWith('#/components/parameters/')) {
      const name = p.$ref.slice('#/components/parameters/'.length);
      return components[name] ?? p;
    }
    return p;
  });
}

/**
 * Recursively walk a SchemaRef union (oneOf/anyOf/allOf) and return all
 * `$ref` strings discovered. Used to detect ErrorResponse references nested
 * inside `oneOf` shapes (e.g. invite-create's 409 envelope+conflict union).
 */
function collectRefs(schema: SchemaRef | undefined): string[] {
  if (!schema) return [];
  const out: string[] = [];
  if (schema.$ref) out.push(schema.$ref);
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const sub = schema[key];
    if (Array.isArray(sub)) {
      for (const s of sub) out.push(...collectRefs(s));
    }
  }
  return out;
}

/**
 * For a given response object (possibly a `$ref` to `components.responses`),
 * return the set of schema `$ref`s it ultimately references via JSON content.
 */
function resolveResponseSchemaRefs(
  response: ResponseObject,
  doc: OpenApiDocument,
): string[] {
  let resolved: ResponseObject = response;
  if (response.$ref?.startsWith('#/components/responses/')) {
    const name = response.$ref.slice('#/components/responses/'.length);
    const fromComponents = doc.components?.responses?.[name];
    if (fromComponents) resolved = fromComponents;
  }
  const json = resolved.content?.['application/json'];
  return collectRefs(json?.schema);
}

interface OperationEntry {
  path: string;
  method: string;
  pathItemParameters: ParameterRef[];
  op: OperationObject;
}

function listOperations(doc: OpenApiDocument): OperationEntry[] {
  const entries: OperationEntry[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const pathParams = item.parameters ?? [];
    for (const method of HTTP_METHODS) {
      const op = item[method] as OperationObject | undefined;
      if (op) {
        entries.push({
          path,
          method,
          pathItemParameters: pathParams,
          op,
        });
      }
    }
  }
  return entries;
}

const OPERATIONS = listOperations(spec);

describe('openapi.yaml — structural invariants', () => {
  it('parses as a valid OpenAPI 3.x document with paths', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths).toBeDefined();
    const pathCount = Object.keys(spec.paths ?? {}).length;
    // Sanity floor: Phase-11 spec has ~70+ paths. If this drops dramatically
    // the spec was probably truncated by a bad merge.
    expect(pathCount).toBeGreaterThan(40);
  });

  it('discovers a non-trivial number of operations', () => {
    // Phase-11 surface has 100+ ops. Same anti-truncation guard as above.
    expect(OPERATIONS.length).toBeGreaterThan(80);
  });

  it('every operation declares operationId, summary, and tags', () => {
    const violations: string[] = [];
    for (const { path, method, op } of OPERATIONS) {
      if (!op.operationId) violations.push(`${method.toUpperCase()} ${path}: missing operationId`);
      if (!op.summary) violations.push(`${method.toUpperCase()} ${path}: missing summary`);
      if (!op.tags || op.tags.length === 0)
        violations.push(`${method.toUpperCase()} ${path}: missing tags`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('operationIds are unique across the spec', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const { path, method, op } of OPERATIONS) {
      if (!op.operationId) continue;
      const here = `${method.toUpperCase()} ${path}`;
      const prev = seen.get(op.operationId);
      if (prev) {
        dupes.push(`${op.operationId}: ${prev} vs ${here}`);
      } else {
        seen.set(op.operationId, here);
      }
    }
    expect(dupes, dupes.join('\n')).toEqual([]);
  });

  it('every mutating operation (POST/PUT/PATCH/DELETE) accepts Idempotency-Key', () => {
    const violations: string[] = [];
    for (const { path, method, op, pathItemParameters } of OPERATIONS) {
      if (!MUTATING_METHODS.has(method)) continue;
      const all = [
        ...resolveParameters(pathItemParameters, spec),
        ...resolveParameters(op.parameters, spec),
      ];
      const hasIdem = all.some(
        (p) => p.in === 'header' && p.name === 'Idempotency-Key',
      );
      if (!hasIdem) {
        violations.push(
          `${method.toUpperCase()} ${path} (${op.operationId ?? '?'}): missing Idempotency-Key parameter`,
        );
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('every operation references ErrorResponse in its 4xx/5xx responses', () => {
    const violations: string[] = [];
    for (const { path, method, op } of OPERATIONS) {
      const responses = op.responses ?? {};
      const errorStatuses = Object.keys(responses).filter((status) =>
        /^[45]\d\d$/.test(status),
      );

      if (errorStatuses.length === 0) {
        violations.push(
          `${method.toUpperCase()} ${path} (${op.operationId ?? '?'}): no 4xx/5xx responses declared`,
        );
        continue;
      }

      for (const status of errorStatuses) {
        const refs = resolveResponseSchemaRefs(responses[status]!, spec);
        const ok = refs.some(
          (r) =>
            r === ERROR_RESPONSE_SCHEMA_REF ||
            // IdempotencyConflictResponse extends the envelope; treat it as
            // a valid ErrorResponse-shaped reply.
            r === IDEMPOTENCY_CONFLICT_SCHEMA_REF,
        );
        if (!ok) {
          violations.push(
            `${method.toUpperCase()} ${path} (${op.operationId ?? '?'}) ${status}: does not reference ErrorResponse (refs: ${refs.join(', ') || 'none'})`,
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('defines the shared ErrorResponse schema', () => {
    expect(spec.components?.schemas?.['ErrorResponse']).toBeDefined();
    expect(spec.components?.schemas?.['IdempotencyConflictResponse']).toBeDefined();
    expect(spec.components?.parameters?.['IdempotencyKey']).toBeDefined();
  });
});
