/**
 * Swagger/OpenAPI Parser Utility
 * Parses Swagger 2.0 and OpenAPI 3.x JSON files and converts them to the internal API doc format
 */

// Types for internal API documentation format
export interface ParamInfo {
  type: string;
  description: string;
  required?: boolean;
  default?: string;
  in?: string; // path, query, header, body
  enum?: string[]; // enum values for dropdown
}

export interface ApiRequestInfo {
  name: string;
  description: string;
  request_url: string;
  method: string;
  headers: Record<string, string>;
  parameters?: Record<string, ParamInfo>;
  response_status_codes?: string[];
}

export interface PayloadExample {
  name: string;
  payload: string;
}

export interface ApiEndpoint {
  slug: string;
  requestInfo: ApiRequestInfo;
  curlContent: string;
  templateContent: string;
  responses: Record<string, string>;
  statusReasons: Record<string, string>;
  requestPayload: string;
  payloadExamples?: PayloadExample[]; // Multiple named examples
}

// Swagger 2.0 Types
interface SwaggerParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData';
  description?: string;
  required?: boolean;
  type?: string;
  format?: string;
  default?: any;
  schema?: any;
}

interface SwaggerResponse {
  description: string;
  schema?: any;
  examples?: Record<string, any>;
}

interface SwaggerOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: SwaggerParameter[];
  responses?: Record<string, SwaggerResponse>;
  consumes?: string[];
  produces?: string[];
  security?: any[];
}

interface SwaggerPath {
  get?: SwaggerOperation;
  post?: SwaggerOperation;
  put?: SwaggerOperation;
  patch?: SwaggerOperation;
  delete?: SwaggerOperation;
  parameters?: SwaggerParameter[];
}

interface SwaggerDoc {
  swagger?: string;
  openapi?: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  host?: string;
  basePath?: string;
  schemes?: string[];
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, SwaggerPath>;
  definitions?: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    requestBodies?: Record<string, any>;
  };
  securityDefinitions?: Record<string, any>;
}

// OpenAPI 3.x Types
interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, {
    schema?: any;
    example?: any;
    examples?: Record<string, { value: any }>;
  }>;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, {
    schema?: any;
    example?: any;
    examples?: Record<string, { value: any }>;
  }>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: SwaggerParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  security?: any[];
}

// Request config from request.json file
export interface RequestConfig {
  headers?: Record<string, string>; // header name -> description
}

/**
 * Parses a Swagger/OpenAPI JSON and returns API endpoints in the internal format
 */
export function parseSwaggerJson(swaggerJson: SwaggerDoc, groupName: string, requestConfig?: RequestConfig, customTemplate?: string | null): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const isOpenApi3 = swaggerJson.openapi?.startsWith('3.') || false;

  // Determine base URL
  let baseUrl = '';
  if (isOpenApi3 && swaggerJson.servers && swaggerJson.servers.length > 0) {
    baseUrl = swaggerJson.servers[0].url;
  } else if (swaggerJson.host) {
    const scheme = swaggerJson.schemes?.[0] || 'https';
    baseUrl = `${scheme}://${swaggerJson.host}${swaggerJson.basePath || ''}`;
  }

  // Process each path
  for (const [pathUrl, pathItem] of Object.entries(swaggerJson.paths)) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    // Get path-level parameters (apply to all operations)
    const pathLevelParams = pathItem.parameters || [];

    for (const method of httpMethods) {
      const operation = pathItem[method] as (SwaggerOperation & OpenApiOperation) | undefined;
      if (!operation) continue;

      const endpoint = parseOperation(
        pathUrl,
        method.toUpperCase(),
        operation,
        pathLevelParams,
        baseUrl,
        groupName,
        swaggerJson,
        isOpenApi3,
        requestConfig,
        customTemplate
      );

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

/**
 * Parse a single operation (endpoint) from the Swagger spec
 */
function parseOperation(
  pathUrl: string,
  method: string,
  operation: SwaggerOperation & OpenApiOperation,
  pathLevelParams: SwaggerParameter[],
  baseUrl: string,
  groupName: string,
  swaggerDoc: SwaggerDoc,
  isOpenApi3: boolean,
  requestConfig?: RequestConfig,
  customTemplate?: string | null
): ApiEndpoint {
  // Generate a slug from operationId or path
  const slug = generateSlug(operation.operationId, pathUrl, method);

  // Combine path-level and operation-level parameters
  const allParams = [...pathLevelParams, ...(operation.parameters || [])];

  // Default values for common URL parameters
  const urlParamDefaults: Record<string, { default: string; description: string }> = {
    'accelqLoginUrl': { default: 'https://acme.accelq.io', description: 'ACCELQ login URL (e.g., https://yourcompany.accelq.io)' },
    'tenant_code': { default: 'tenant_code', description: 'Your tenant code' },
    'projectCode': { default: 'project_code', description: 'Project code' },
  };

  // Extract URL parameters from the full URL (baseUrl + pathUrl)
  // These are parameters in curly braces like {accelqLoginUrl}, {tenant_code}
  const fullUrlForParsing = baseUrl + pathUrl;
  const urlParamMatches = fullUrlForParsing.match(/\{([^}]+)\}/g) || [];
  const urlParamNames = urlParamMatches.map(match => match.slice(1, -1));

  // Extract server variable descriptions for OpenAPI 3.x
  const serverVariables: Record<string, { default: string; description: string }> = {};
  if (isOpenApi3 && swaggerDoc.servers) {
    for (const server of swaggerDoc.servers) {
      if ((server as any).variables) {
        for (const [varName, varInfo] of Object.entries((server as any).variables as Record<string, any>)) {
          serverVariables[varName] = {
            default: varInfo.default || varName,
            description: varInfo.description || ''
          };
        }
      }
    }
  }

  // Parse parameters into internal format
  // First, add URL parameters (so they appear first in the interactive section)
  const parameters: Record<string, ParamInfo> = {};

  // Add URL path parameters first (in order of appearance in URL)
  for (const paramName of urlParamNames) {
    // Check if this param is already defined in allParams
    const existingParam = allParams.find(p => p.name === paramName);

    if (existingParam) {
      // Use existing definition but ensure it has a default
      const defaults = urlParamDefaults[paramName];
      const enumValues = getParamEnum(existingParam);
      parameters[paramName] = {
        type: getParamType(existingParam, swaggerDoc, isOpenApi3),
        description: existingParam.description || defaults?.description || '',
        required: existingParam.required ?? true,
        default: existingParam.default !== undefined ? String(existingParam.default) : defaults?.default,
        in: 'path',
        enum: enumValues
      };
    } else {
      // Check if defined in server variables
      const serverVar = serverVariables[paramName];
      const defaults = urlParamDefaults[paramName];

      parameters[paramName] = {
        type: 'string',
        description: serverVar?.description || defaults?.description || `URL parameter: ${paramName}`,
        required: true,
        default: serverVar?.default || defaults?.default || paramName,
        in: 'path'
      };
    }
  }

  // Then add remaining parameters (query, header, body, etc.)
  for (const param of allParams) {
    // Skip if already added as URL parameter
    if (urlParamNames.includes(param.name)) continue;

    const enumValues = getParamEnum(param);
    parameters[param.name] = {
      type: getParamType(param, swaggerDoc, isOpenApi3),
      description: param.description || '',
      required: param.required || param.in === 'path',
      default: param.default !== undefined ? String(param.default) : undefined,
      in: param.in,
      enum: enumValues
    };
  }

  // Handle request body (OpenAPI 3.x)
  let requestPayload = '';
  let payloadExamples: PayloadExample[] | undefined;

  if (isOpenApi3 && operation.requestBody) {
    const body = operation.requestBody;
    const content = body.content?.['application/json'];
    if (content) {
      // Check if there are multiple named examples
      if (content.examples && Object.keys(content.examples).length > 0) {
        payloadExamples = Object.entries(content.examples).map(([name, exampleObj]) => {
          const payloadStr = JSON.stringify(exampleObj.value, null, 2);
          // Don't extract parameters from payload - use swagger-defined parameters only
          return {
            name,
            payload: payloadStr
          };
        });
        // Use first example as default
        requestPayload = payloadExamples[0].payload;
      } else if (content.example) {
        requestPayload = JSON.stringify(content.example, null, 2);
      } else if (content.schema) {
        requestPayload = generateExampleFromSchema(content.schema, swaggerDoc, isOpenApi3);
      }
    }
  }

  // Handle body parameter (Swagger 2.0)
  const bodyParam = allParams.find(p => p.in === 'body');
  if (!isOpenApi3 && bodyParam && bodyParam.schema) {
    requestPayload = generateExampleFromSchema(bodyParam.schema, swaggerDoc, isOpenApi3);
  }

  // Parse responses
  const responses: Record<string, string> = {};
  const statusReasons: Record<string, string> = {};
  const responseStatusCodes: string[] = [];

  if (operation.responses) {
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      if (statusCode === 'default') continue;

      responseStatusCodes.push(statusCode);
      statusReasons[statusCode] = response.description || getDefaultStatusReason(statusCode);

      // Extract response example
      const responseExample = extractResponseExample(response, swaggerDoc, isOpenApi3);
      if (responseExample) {
        responses[statusCode] = responseExample;
      }
    }
  }

  // Build request URL
  const fullUrl = baseUrl + pathUrl;

  // Determine headers - use request.json config if available, otherwise from swagger
  const headers: Record<string, string> = {};

  if (requestConfig?.headers) {
    // Use headers from request.json (value is the description for display)
    for (const [headerName, headerDesc] of Object.entries(requestConfig.headers)) {
      headers[headerName] = headerDesc;

      // Add headers as parameters for the interactive section
      // Skip standard non-editable headers
      if (headerName !== 'Content-Type' && headerName !== 'Accept') {
        parameters[headerName] = {
          type: 'string',
          description: headerDesc,
          required: true,
          default: '',
          in: 'header'
        };
      }
    }
  } else {
    // Fall back to swagger-defined header parameters
    const headerParams = allParams.filter(p => p.in === 'header');
    for (const hp of headerParams) {
      headers[hp.name] = hp.default ? String(hp.default) : `<${hp.name}>`;
    }

    // Add Content-Type if there's a body
    if (requestPayload || bodyParam || operation.requestBody) {
      headers['Content-Type'] = 'application/json';
    }

    // Add Accept header if produces is specified
    if (operation.produces?.includes('application/json') || isOpenApi3) {
      headers['Accept'] = 'application/json';
    }
  }

  // Build API request info
  const requestInfo: ApiRequestInfo = {
    name: operation.summary || operation.operationId || `${method} ${pathUrl}`,
    description: operation.description || operation.summary || '',
    request_url: fullUrl,
    method: method,
    headers: headers,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    response_status_codes: responseStatusCodes.length > 0 ? responseStatusCodes : undefined
  };

  // Generate cURL content
  const curlContent = generateCurlContent(requestInfo, parameters, requestPayload);

  // Generate template content - use custom template if provided, otherwise use default
  const templateContent = customTemplate || generateTemplateContent();

  return {
    slug: `${groupName}/${slug}`,
    requestInfo,
    curlContent,
    templateContent,
    responses,
    statusReasons,
    requestPayload,
    payloadExamples
  };
}

/**
 * Generate a URL-friendly slug from operation ID or path
 */
function generateSlug(operationId: string | undefined, pathUrl: string, method: string): string {
  if (operationId) {
    // Convert camelCase/PascalCase to kebab-case
    return operationId
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  // Generate from path and method
  const pathSlug = pathUrl
    .replace(/^\//, '')
    .replace(/\{[^}]+\}/g, 'by-id')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  return `${method.toLowerCase()}-${pathSlug}`;
}

/**
 * Get parameter type, resolving $ref if needed
 */
function getParamType(param: SwaggerParameter, swaggerDoc: SwaggerDoc, isOpenApi3: boolean): string {
  if (param.type) {
    return param.type;
  }

  if (param.schema) {
    if (param.schema.$ref) {
      return 'object';
    }
    return param.schema.type || 'object';
  }

  return 'string';
}

/**
 * Get parameter enum values if defined
 */
function getParamEnum(param: SwaggerParameter): string[] | undefined {
  // Check for enum in parameter itself (Swagger 2.0 style)
  if (param.enum) {
    return param.enum.map(String);
  }

  // Check for enum in schema (OpenAPI 3.x style)
  if (param.schema?.enum) {
    return param.schema.enum.map(String);
  }

  return undefined;
}


/**
 * Generate example JSON from a schema definition
 */
function generateExampleFromSchema(schema: any, swaggerDoc: SwaggerDoc, isOpenApi3: boolean, depth = 0): string {
  if (depth > 5) return '{}'; // Prevent infinite recursion

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/', '').split('/');
    let resolved = swaggerDoc as any;
    for (const segment of refPath) {
      resolved = resolved?.[segment];
    }
    if (resolved) {
      return generateExampleFromSchema(resolved, swaggerDoc, isOpenApi3, depth + 1);
    }
    return '{}';
  }

  // Handle example
  if (schema.example !== undefined) {
    return JSON.stringify(schema.example, null, 2);
  }

  // Generate based on type
  const example = generateExampleValue(schema, swaggerDoc, isOpenApi3, depth);
  return JSON.stringify(example, null, 2);
}

/**
 * Generate an example value based on schema type
 */
function generateExampleValue(schema: any, swaggerDoc: SwaggerDoc, isOpenApi3: boolean, depth = 0): any {
  if (depth > 5) return {}; // Prevent infinite recursion

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/', '').split('/');
    let resolved = swaggerDoc as any;
    for (const segment of refPath) {
      resolved = resolved?.[segment];
    }
    if (resolved) {
      return generateExampleValue(resolved, swaggerDoc, isOpenApi3, depth + 1);
    }
    return {};
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum) return schema.enum[0];
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return 'string';
    case 'number':
    case 'integer':
      return schema.minimum || 0;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        return [generateExampleValue(schema.items, swaggerDoc, isOpenApi3, depth + 1)];
      }
      return [];
    case 'object':
      const obj: Record<string, any> = {};
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateExampleValue(propSchema as any, swaggerDoc, isOpenApi3, depth + 1);
        }
      }
      return obj;
    default:
      if (schema.properties) {
        const obj: Record<string, any> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateExampleValue(propSchema as any, swaggerDoc, isOpenApi3, depth + 1);
        }
        return obj;
      }
      return {};
  }
}

/**
 * Extract response example from a response object
 */
function extractResponseExample(response: SwaggerResponse | OpenApiResponse, swaggerDoc: SwaggerDoc, isOpenApi3: boolean): string {
  if (isOpenApi3) {
    const openApiResponse = response as OpenApiResponse;
    const content = openApiResponse.content?.['application/json'];
    if (content) {
      if (content.example) {
        return JSON.stringify(content.example, null, 2);
      }
      if (content.examples && Object.keys(content.examples).length > 0) {
        const firstExample = Object.values(content.examples)[0];
        return JSON.stringify(firstExample.value, null, 2);
      }
      if (content.schema) {
        return generateExampleFromSchema(content.schema, swaggerDoc, isOpenApi3);
      }
    }
  } else {
    const swagger2Response = response as SwaggerResponse;
    if (swagger2Response.examples?.['application/json']) {
      return JSON.stringify(swagger2Response.examples['application/json'], null, 2);
    }
    if (swagger2Response.schema) {
      return generateExampleFromSchema(swagger2Response.schema, swaggerDoc, isOpenApi3);
    }
  }

  return '';
}

/**
 * Get default status reason text
 */
function getDefaultStatusReason(statusCode: string): string {
  const reasons: Record<string, string> = {
    '200': 'Success',
    '201': 'Created',
    '204': 'No Content',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '403': 'Forbidden',
    '404': 'Not Found',
    '409': 'Conflict',
    '422': 'Unprocessable Entity',
    '500': 'Internal Server Error'
  };
  return reasons[statusCode] || 'Response';
}

/**
 * Generate cURL content with parameter placeholders
 */
function generateCurlContent(
  requestInfo: ApiRequestInfo,
  parameters: Record<string, ParamInfo>,
  requestPayload: string
): string {
  let curl = `curl -X ${requestInfo.method} "${requestInfo.request_url}"`;

  // Add headers
  for (const [key, value] of Object.entries(requestInfo.headers)) {
    // Check if this is a parameter that should be a placeholder
    const paramMatch = Object.entries(parameters).find(([pName, pInfo]) =>
      pInfo.in === 'header' && pName.toLowerCase() === key.toLowerCase()
    );

    if (paramMatch) {
      curl += ` \\\n  -H "${key}: $\{{${paramMatch[0]}}}"`;
    } else {
      curl += ` \\\n  -H "${key}: ${value}"`;
    }
  }

  // Replace path parameters in URL with placeholders
  for (const [paramName, paramInfo] of Object.entries(parameters)) {
    if (paramInfo.in === 'path') {
      curl = curl.replace(`{${paramName}}`, `$\{{${paramName}}}`);
    }
  }

  // Add query parameters as placeholders
  const queryParams = Object.entries(parameters).filter(([_, p]) => p.in === 'query');
  if (queryParams.length > 0) {
    const queryString = queryParams
      .map(([name, _]) => `${name}=$\{{${name}}}`)
      .join('&');

    // Check if URL already has query params
    if (curl.includes('?')) {
      // Find the closing quote after the URL and insert query params before it
      curl = curl.replace(/(")\s*\\/, `&${queryString}$1 \\`);
    } else {
      // Find the closing quote after the URL and insert query params before it
      curl = curl.replace(/(")\s*\\/, `?${queryString}$1 \\`);
    }
  }

  // Add request body (if present, regardless of HTTP method)
  if (requestPayload) {
    // Replace values in payload with parameter placeholders
    let body = requestPayload;
    for (const [paramName, _] of Object.entries(parameters)) {
      // Replace string values
      body = body.replace(
        new RegExp(`"${paramName}":\\s*"[^"]*"`, 'g'),
        `"${paramName}": "$\{{${paramName}}}"`
      );
    }
    curl += ` \\\n  -d '${body}'`;
  }

  return curl;
}

/**
 * Generate markdown template content
 */
function generateTemplateContent(): string {
  return `# {{API_NAME}}

{{API_DESCRIPTION}}

## Request

**Method:** \`{{METHOD}}\`

**URL:** \`{{REQUEST_URL}}\`

## Headers

{{HEADERS}}

## Parameters

{{PARAMETERS}}

{{REQUEST_PAYLOAD}}

## Responses

{{RESPONSES}}

{{INTERACTIVE_SECTION}}
`;
}

/**
 * Check if a directory contains a Swagger/OpenAPI file
 */
export function hasSwaggerFile(groupPath: string, fs: any): boolean {
  const swaggerFiles = ['swagger.json', 'openapi.json', 'swagger.yaml', 'openapi.yaml'];
  for (const file of swaggerFiles) {
    const filePath = `${groupPath}/${file}`;
    if (fs.existsSync(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the Swagger/OpenAPI file path from a directory
 */
export function getSwaggerFilePath(groupPath: string, fs: any): string | null {
  const swaggerFiles = ['swagger.json', 'openapi.json'];
  for (const file of swaggerFiles) {
    const filePath = `${groupPath}/${file}`;
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Load and parse a Swagger file from disk
 */
export function loadSwaggerFile(filePath: string, fs: any): SwaggerDoc | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading Swagger file: ${filePath}`, error);
    return null;
  }
}

/**
 * Load request.json config file from a group directory
 */
export function loadRequestConfig(groupPath: string, fs: any): RequestConfig | null {
  const requestJsonPath = `${groupPath}/request.json`;
  try {
    if (fs.existsSync(requestJsonPath)) {
      const content = fs.readFileSync(requestJsonPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error loading request.json: ${requestJsonPath}`, error);
  }
  return null;
}

/**
 * Load custom template.md file from a group directory
 */
export function loadTemplateFile(groupPath: string, fs: any): string | null {
  const templatePath = `${groupPath}/template.md`;
  try {
    if (fs.existsSync(templatePath)) {
      const content = fs.readFileSync(templatePath, 'utf-8');
      return content;
    }
  } catch (error) {
    console.error(`Error loading template.md: ${templatePath}`, error);
  }
  return null;
}
