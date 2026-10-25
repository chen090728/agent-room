import { router } from 'expo-router';
import { useEffect } from 'react';
import { useSheets, type SheetName, type SheetParams } from './sheets';

/**
 * Some screens still push a route to reach a sheet (the home list does). Those
 * routes are invisible: they step back at once and open the sheet instead.
 */
export function useOpenSheetFromRoute(name: SheetName, params: SheetParams = {}) {
  const sheets = useSheets();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
    sheets.open(name, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
