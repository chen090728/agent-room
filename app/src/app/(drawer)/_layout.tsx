import { Drawer } from 'expo-router/drawer';
import { GroupDrawer } from '../../components/GroupDrawer';
import { colors } from '../../theme';

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <GroupDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        overlayColor: colors.overlay,
        swipeEdgeWidth: 40,
        drawerStyle: { width: 312, backgroundColor: colors.bg },
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="chat/[id]" />
    </Drawer>
  );
}
