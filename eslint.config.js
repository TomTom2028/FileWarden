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
			'@typescript-eslint/consistent-type-definitions': ['error', 'type']
		}
	},
	{
		files: ['scripts/**/*.{js,mjs,cjs}', 'prisma.config.ts', 'eslint.config.js'],
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
