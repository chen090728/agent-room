import { useOpenSheetFromRoute } from '../../sheetRoute';

/** Kept so links to /group/new still work: it opens the new-group sheet. */
export default function NewGroupRoute() {
  useOpenSheetFromRoute('group-new');
  return null;
}
