import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function MapScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Pulse"
      title="THE CITY IS MOVING."
      description="Prototype map language uses aggregate activity, Places and Plan Forming—not public individual tracking."
      dark
    >
      <View style={styles.map}>
        <View style={[styles.pulse, styles.one]}><Text style={styles.pulseText}>11</Text></View>
        <View style={[styles.pulse, styles.two]}><Text style={styles.pulseText}>7</Text></View>
        <View style={[styles.pulse, styles.three]}><Text style={styles.pulseText}>4</Text></View>
        <Text style={styles.mapLabel}>Jeanne-Mance Park · football demand forming</Text>
      </View>
      <ActionButton
        label="CREATE FROM THIS DEMAND"
        onPress={() => router.push('/plan/football-tonight')}
      />
      <ActionButton
        label="PRESENCE: APPROXIMATE ONLY"
        variant="secondary"
        onPress={() => undefined}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 400,
    borderRadius: radius.lg,
    backgroundColor: colors.black,
    position: 'relative',
    overflow: 'hidden',
  },
  pulse: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.maroon,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 10,
    borderColor: '#3A1212',
  },
  one: { left: 36, top: 70 },
  two: { right: 46, top: 150 },
  three: { left: 130, bottom: 80 },
  pulseText: { color: colors.white, fontWeight: '900', fontSize: 22 },
  mapLabel: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    color: colors.taupe,
    fontWeight: '800',
  },
});
