# ACCELQ API Documentation

A static API documentation site built with Astro. API endpoints are organized into groups and documented using structured data files that are automatically rendered into interactive documentation pages.

## Project Structure

```
/
├── api_doc_data/                    # API documentation data
│   └── <group-name>/                # API group (e.g., users, products, orders)
│       └── <api-name>/              # Individual API endpoint
│           ├── api-request-info.json    # API metadata (name, method, URL, headers, parameters)
│           ├── template.md              # Documentation template with placeholders
│           ├── curl.content             # cURL command template with parameter placeholders
│           ├── request_payload.json     # Sample request payload (optional, for POST/PUT/PATCH)
│           └── <status-code>/           # Response samples by status code
│               └── response.content     # Response body sample (e.g., 200/, 201/, 500/)
├── public/                          # Static assets
│   └── favicon.svg
├── src/
│   ├── assets/                      # Project assets
│   ├── components/                  # Reusable Astro components
│   ├── layouts/
│   │   └── Layout.astro             # Main layout wrapper
│   └── pages/
│       ├── index.astro              # Homepage with grouped API listing
│       └── api/
│           └── [...slug].astro      # Dynamic API documentation page
├── dist/                            # Build output (generated)
├── astro.config.mjs                 # Astro configuration
├── package.json
└── tsconfig.json
```

### Example Structure

```
api_doc_data/
├── users/                           # Users API group
│   ├── get-users/
│   ├── create-user/
│   └── update-user/
├── products/                        # Products API group
│   ├── list-products/
│   └── get-product/
└── orders/                          # Orders API group
    ├── create-order/
    └── get-order/
```

## Adding a New API Group

1. Create a new folder under `api_doc_data/` with the group name (e.g., `products`)
2. Add API endpoint folders inside the group folder

## Adding a New API Endpoint

1. Create a new folder under your group folder (e.g., `api_doc_data/users/delete-user`)
2. Add the required files:
   - `api-request-info.json` - API metadata
   - `template.md` - Documentation template
   - `curl.content` - cURL command template
3. Add response samples in status code folders (e.g., `200/response.content`)

### api-request-info.json Example

```json
{
  "name": "Get Users",
  "description": "Retrieves a list of users from the system.",
  "request_url": "https://api.example.com/v1/users",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer <access_token>",
    "Accept": "application/json"
  },
  "parameters": {
    "page": {
      "type": "integer",
      "required": false,
      "description": "Page number for pagination",
      "default": "1"
    }
  },
  "response_status_codes": ["200", "500"]
}
```

### Template Placeholders

Use these placeholders in `template.md`:
- `{{API_NAME}}` - API name
- `{{API_DESCRIPTION}}` - API description
- `{{METHOD}}` - HTTP method
- `{{REQUEST_URL}}` - Request URL
- `{{HEADERS}}` - Headers table
- `{{PARAMETERS}}` - Parameters table
- `{{RESPONSES}}` - Response samples
- `{{INTERACTIVE_SECTION}}` - Interactive section (auto-rendered)

### cURL Placeholders

In `curl.content`, use `${{paramName}}` for parameters that will be replaced by user input in the interactive section.

## Commands

All commands are run from the root of the project:

| Command           | Action                                           |
| :---------------- | :----------------------------------------------- |
| `npm install`     | Install dependencies                             |
| `npm run dev`     | Start local dev server at `localhost:4321`       |
| `npm run build`   | Build production site to `./dist/`               |
| `npm run preview` | Preview the build locally before deploying       |

## Output

- **Development**: Run `npm run dev` to start a local server at `http://localhost:4321`
- **Production Build**: Run `npm run build` to generate static files in the `./dist/` folder
- **Preview Build**: Run `npm run preview` to serve the built files locally for testing

The `dist/` folder contains the complete static site ready for deployment to any static hosting service.
