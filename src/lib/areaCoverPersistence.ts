import { supabase } from './supabase'
import {
  AREA_COVER_BUCKET,
  AREA_COVER_UPLOAD_ERROR_MESSAGE,
  buildAreaCoverStoragePath,
  validateAreaCoverStoragePath,
} from './areaCoverImageCore'
import { getErrorMessage } from './errors'

const AREA_COVER_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  FOREIGN_OR_MISSING_AREA: 'Diese Rasenfläche ist nicht mehr verfügbar.',
  INVALID_COVER_PATH: 'Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.',
}

function mapAreaCoverError(error: unknown, fallback: string): Error {
  const message = getErrorMessage(error, fallback)

  for (const [code, userMessage] of Object.entries(AREA_COVER_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return new Error(userMessage)
    }
  }

  return new Error(fallback)
}

export async function createSignedCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(AREA_COVER_BUCKET)
    .createSignedUrl(path, 3600)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}

export async function createSignedCoverUrls(
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))]
  const entries = await Promise.all(
    uniquePaths.map(async (path) => {
      const url = await createSignedCoverUrl(path)
      return url ? ([path, url] as const) : null
    }),
  )

  return new Map(entries.filter((entry): entry is [string, string] => entry != null))
}

export async function uploadAreaCoverImage(input: {
  userId: string
  areaId: string
  file: Blob
}): Promise<string> {
  const path = buildAreaCoverStoragePath(input.userId, input.areaId)

  if (!validateAreaCoverStoragePath(input.userId, input.areaId, path)) {
    throw new Error(AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  const { error } = await supabase.storage.from(AREA_COVER_BUCKET).upload(path, input.file, {
    contentType: 'image/jpeg',
    upsert: false,
  })

  if (error) {
    throw new Error(AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  return path
}

export async function commitAreaCoverImage(input: {
  areaId: string
  coverImagePath: string
}): Promise<{ coverImagePath: string; oldCoverImagePath: string | null }> {
  const { data, error } = await supabase.rpc('set_area_cover_image', {
    p_area_id: input.areaId,
    p_cover_image_path: input.coverImagePath,
  })

  if (error) {
    throw mapAreaCoverError(error, AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  if (!data || typeof data !== 'object') {
    throw new Error(AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  const result = data as {
    cover_image_path?: string
    old_cover_image_path?: string | null
  }

  if (!result.cover_image_path) {
    throw new Error(AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  return {
    coverImagePath: result.cover_image_path,
    oldCoverImagePath: result.old_cover_image_path ?? null,
  }
}

export async function removeAreaCoverImage(areaId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('remove_area_cover_image', {
    p_area_id: areaId,
  })

  if (error) {
    throw mapAreaCoverError(error, AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  if (!data || typeof data !== 'object') {
    throw new Error(AREA_COVER_UPLOAD_ERROR_MESSAGE)
  }

  return (data as { old_cover_image_path?: string | null }).old_cover_image_path ?? null
}

export async function deleteCoverImageFromStorage(path: string | null | undefined): Promise<void> {
  if (!path) {
    return
  }

  await supabase.storage.from(AREA_COVER_BUCKET).remove([path])
}
