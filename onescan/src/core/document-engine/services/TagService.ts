import { tagRepository } from '@/core/database/repositories/tagRepository';
import type { TagRecord } from '../model';

export const MAX_TAG_NAME = 30;

export type TagError = 'empty' | 'too_long' | 'exists';

export class TagServiceError extends Error {
  constructor(readonly code: TagError) {
    super(code);
  }
}

/** Trimmed, single spaces. Names are unique without regard to case ("Tax" = "tax"). */
export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function validName(name: string): string {
  const n = normalizeTagName(name);
  if (!n) throw new TagServiceError('empty');
  if (n.length > MAX_TAG_NAME) throw new TagServiceError('too_long');
  return n;
}

/** Tags: local labels, independent of folders. Screens call this, never the repository. */
export const TagService = {
  list: (): Promise<TagRecord[]> => tagRepository.list(),

  async create(name: string): Promise<string> {
    const n = validName(name);
    if (await tagRepository.findByName(n)) throw new TagServiceError('exists');
    return tagRepository.create(n);
  },

  async rename(id: string, name: string): Promise<void> {
    const n = validName(name);
    const other = await tagRepository.findByName(n);
    if (other && other.id !== id) throw new TagServiceError('exists');
    await tagRepository.rename(id, n);
  },

  remove: (id: string) => tagRepository.remove(id),

  forDocument: (documentId: string) => tagRepository.forDocument(documentId),

  async setAssigned(documentId: string, tagId: string, assigned: boolean): Promise<void> {
    if (assigned) await tagRepository.assign(documentId, tagId);
    else await tagRepository.unassign(documentId, tagId);
  },

  assignments: () => tagRepository.assignments(),
};
