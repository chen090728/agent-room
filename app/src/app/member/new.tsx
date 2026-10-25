import { useLocalSearchParams } from 'expo-router';
import { useOpenSheetFromRoute } from '../../sheetRoute';

/** Kept so links to /member/new still work: it opens the new-assistant sheet. */
export default function NewMemberRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  useOpenSheetFromRoute('member-new', groupId ? { groupId } : {});
  return null;
}
