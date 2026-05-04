import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

export default tseslint.config(
	{
		ignores: ['build/**', 'dist/**', 'node_modules/**', 'src/generated/**', '.cache/**']
	},
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/no-unsafe-type-assertion': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			// Allow numbers (and bigint) in template literals — `${count}` is idiomatic for logs;
			// requiring `.toString()` everywhere is more noise than safety.
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }]
		}
	},
	{
		// Build scripts run on Node directly via runtime type-stripping; expose Node globals
		// so rules like no-undef don't flag `process` / `console`.
		files: ['scripts/**/*.ts'],
		languageOptions: {
			globals: { ...globals.node }
		}
	},
	{
		// Files outside any tsconfig get type-checking disabled to avoid project-service
		// errors. eslint.config.js is ESM JS; prisma.config.ts isn't included in either tsconfig.
		files: ['eslint.config.js', 'prisma.config.ts'],
		...tseslint.configs.disableTypeChecked,
		languageOptions: {
			parserOptions: {
				project: null,
				projectService: false
			},
			globals: { ...globals.node }
		}
	},
	prettier
)
