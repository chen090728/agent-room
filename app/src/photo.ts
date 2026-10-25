import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'library' | 'camera';

const PHOTO_SIZE = 256;

/**
 * Lets the user take or choose a picture, crops it to a centred square and
 * shrinks it to a small JPEG data URI (shown in a circle). Returns null when
 * cancelled; throws a readable error when permission is refused.
 */
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  return (await pickPicture(source))?.dataUri ?? null;
}

/** Like pickPhoto, but also returns the file address of the shrunken picture (for uploading). */
export async function pickPicture(source: PhotoSource): Promise<{ uri: string; dataUri: string } | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('没有相机权限。请在系统设置里允许 AgentHub 使用相机');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const side = Math.min(asset.width, asset.height);
  const actions: ImageManipulator.Action[] = [];
  // The system editor already crops, but not every platform does; make sure it is square.
  if (asset.width !== asset.height) {
    actions.push({ crop: { originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side } });
  }
  actions.push({ resize: { width: PHOTO_SIZE, height: PHOTO_SIZE } });
  const out = await ImageManipulator.manipulateAsync(asset.uri, actions, { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('处理图片失败');
  return { uri: out.uri, dataUri: `data:image/jpeg;base64,${out.base64}` };
}
