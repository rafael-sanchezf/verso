/**
 * Edit profile's "Change photo" (profile-brief, Edit profile): the system
 * picker, a square crop, resized to 512 and saved as a JPEG, then
 * `uploadAvatar`, which puts it in the caller's folder of the `avatars`
 * bucket and points `profiles.avatar_url` at it.
 *
 * `expo-image-picker` and `expo-image-manipulator` are Expo's own modules,
 * added with this screen (no third-party SDK, decision 21); the picker only
 * asks for the photo library, never the camera.
 */

import { uploadAvatar, type Profile } from '@verso/api';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** The side the photo is resized to before upload (profile-brief: "resized to 512"). */
export const AVATAR_SIDE = 512;

/**
 * Pick, resize and upload. Resolves to the updated profile, or null when the
 * person cancelled the picker or refused the library permission.
 */
export async function pickAndUploadAvatar(): Promise<Profile | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;

  // The picker crops to a square on iOS and Android; the web picker cannot,
  // so the centre square is cut here whenever the image is not one already.
  const context = ImageManipulator.manipulate(asset.uri);
  const side = Math.min(asset.width, asset.height);
  if (side > 0 && asset.width !== asset.height) {
    context.crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    });
  }
  context.resize({ width: AVATAR_SIDE, height: AVATAR_SIDE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const bytes =
    Platform.OS === 'web'
      ? await (await fetch(saved.uri)).arrayBuffer()
      : await new File(saved.uri).arrayBuffer();

  return uploadAvatar(supabase, bytes, { contentType: 'image/jpeg' });
}
