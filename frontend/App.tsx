import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { ScenarioListScreen } from './src/screens/ScenarioListScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { PostSessionScreen } from './src/screens/PostSessionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { palette } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ScenarioStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.primary, fontWeight: '600', fontSize: 20 },
        headerTintColor: palette.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ScenarioList" component={ScenarioListScreen} options={{ title: 'LingoFlow' }} />
      <Stack.Screen name="Session" component={SessionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostSession" component={PostSessionScreen} options={{ title: 'Review' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.primary, fontWeight: '600', fontSize: 20 },
          headerShadowVisible: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: palette.surfaceContainerLowest,
            borderTopColor: palette.outlineVariant,
            borderTopWidth: 1,
            minHeight: 68,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
          tabBarIcon: ({ color, focused }) => {
            const icons: Record<string, string> = { Scenarios: '📚', History: '💬', Settings: '⚙️' };
            return (
              <View style={focused ? {
                backgroundColor: palette.primaryContainer,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 4,
              } : undefined}>
                <Text style={{ color: focused ? palette.onPrimaryContainer : color, fontSize: 18, lineHeight: 22 }}>
                  {icons[route.name] || '•'}
                </Text>
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Scenarios" component={ScenarioStack} options={{ headerShown: false }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
