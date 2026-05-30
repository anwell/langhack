import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ScenarioListScreen } from './src/screens/ScenarioListScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { PostSessionScreen } from './src/screens/PostSessionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ScenarioStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ScenarioList" component={ScenarioListScreen} options={{ title: 'Scenarios' }} />
      <Stack.Screen name="Session" component={SessionScreen} options={{ title: 'Voice session' }} />
      <Stack.Screen name="PostSession" component={PostSessionScreen} options={{ title: 'Review' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Tab.Navigator>
        <Tab.Screen name="Scenarios" component={ScenarioStack} options={{ headerShown: false }} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
