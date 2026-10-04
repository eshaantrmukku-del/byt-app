import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View, Button } from 'react-native';
import { useRouter } from 'expo-router';

export default function ModalScreen() {
    const router = useRouter();
    return (
        <View style={styles.container}>
            <Text style={styles.title}>New Item (Modal)</Text>
            <View style={styles.separator} />
            <Button title="Close" onPress={() => router.back()} />
            <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center'},
    title: {
        fontSize: 20,
        fontWeight: 'bold'},
    separator: {
        marginVertical: 30,
        height: 1,
        width: '80%',
        backgroundColor: '#eee'}});
