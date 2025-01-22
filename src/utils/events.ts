import { MonitorState } from '../const';

type Listener<T> = (data: T) => void;

class EventEmitter<T> {
    private listeners: Listener<T>[] = [];

    subscribe(listener: Listener<T>) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    emit(data: T) {
        this.listeners.forEach(listener => listener(data));
    }
}

export const monitorEvents = new EventEmitter<MonitorState>(); 