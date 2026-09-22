import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { StatusChip } from '@/components/StatusChip';
import { spacing } from '@/theme/tokens';

export default function DownForScreen() {
  return (
    <OjoroScreen
      eyebrow="Down For"
      title="FOOTBALL TONIGHT."
      description="Ojoro has found compatible intent nearby. You are not joining an event yet—you are helping one become real."
    >
      <View style={styles.row}>
        <StatusChip label="Football" active />
        <StatusChip label="Tonight" active />
        <StatusChip label="After 7" active />
        <StatusChip label="≤ 5 km" />
        <StatusChip label="Social / Balanced" />
      </View>
      <ActionButton
        label="I’M DOWN"
        onPress={() => router.replace('/plan/football-tonight')}
        accessibilityHint="Commit to the football plan forming tonight"
      />
      <ActionButton
        label="I’M DOWN IF…"
        variant="secondary"
        onPress={() => router.replace('/plan/football-tonight')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
