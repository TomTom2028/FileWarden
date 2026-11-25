import { Hasher, HasherType } from '../types/hashTypes.ts'
import FullHasher from './fullHasher.ts'
import QuickHasher from './quickHasher.ts'

export function createHasher(type: HasherType): Hasher {
	switch (type) {
		case 'FULL':
			return new FullHasher()
		case 'QUICK':
			return new QuickHasher()
	}
}
