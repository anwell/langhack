import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
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
        headerStyle: { backgroundColor: palette.paper },
        headerTitleStyle: { color: palette.ink, fontWeight: '900' },
        headerTintColor: palette.indigo,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ScenarioList" component={ScenarioListScreen} options={{ title: 'Scenarios' }} />
      <Stack.Screen name="Session" component={SessionScreen} options={{ title: 'Voice session' }} />
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
          headerStyle: { backgroundColor: palette.paper },
          headerTitleStyle: { color: palette.ink, fontWeight: '900' },
          headerShadowVisible: false,
          tabBarActiveTintColor: palette.ink,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.line,
            borderTopWidth: 1,
            minHeight: 68,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontWeight: '800', fontSize: 12 },
          tabBarIcon: ({ color, focused }) => {
            const icons: Record<string, string> = { Scenarios: '✦', History: '◷', Settings: '⚙' };
            return (
              <Text style={{ color, fontSize: focused ? 23 : 20, lineHeight: 22 }}>
                {icons[route.name] || '•'}
              </Text>
            );
          },
        })}
      >
        <Tab.Screen name="Scenarios" component={ScenarioStack} options={{ headerShown: false }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'Logbook' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Studio' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
