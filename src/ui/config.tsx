import {
    DEFAULT_PORT,
    CONFIG_KEYS,
    LyricSource,
    SOURCE_NAMES,
} from "../const";
import { Monitor } from './monitor';

interface ConfigProps {
    onSave: (port: number) => Promise<void>;
    onLyricSourceChange: (source: LyricSource) => Promise<void>;
    defaultPort: number;
    defaultLyricSource: LyricSource;
}

export function Config({ onSave, onLyricSourceChange, defaultPort, defaultLyricSource }: ConfigProps) {
    const [port, setPort] = React.useState(defaultPort);
    const [lyricSource, setLyricSource] = React.useState(defaultLyricSource);
    const [showSuccess, setShowSuccess] = React.useState(false);

    React.useEffect(() => {
        // 读取端口配置
        betterncm.app.readConfig(CONFIG_KEYS.PORT, defaultPort.toString())
            .then(savedPort => {
                setPort(Number(savedPort));
            });

        // 读取歌词来源配置
        betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, defaultLyricSource.toString())
            .then(savedSource => {
                setLyricSource(Number(savedSource));
            });
    }, [defaultPort, defaultLyricSource]);

    const handlePortChange = async () => {
        const portNum = Number(port);
        if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
            await onSave(portNum);
            await onLyricSourceChange(lyricSource);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        }
    };

    const handleSourceChange = async (event) => {
        const newSource = Number(event.target.value) as LyricSource;
        setLyricSource(newSource);
        await onLyricSourceChange(newSource);
    };

    const styles = {
        container: {
            padding: '24px',
            maxWidth: '900px',
            margin: '20px auto',
            backgroundColor: '#fff',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        },
        title: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#ff85a2',
            marginBottom: '24px',
            paddingBottom: '12px',
            borderBottom: '2px solid #ffd6e0'
        },
        section: {
            marginBottom: '24px',
            padding: '20px',
            backgroundColor: '#fff9fa',
            borderRadius: '12px',
            border: '1px solid #ffe4e8'
        },
        sectionTitle: {
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#ff85a2',
            marginBottom: '16px'
        },
        label: {
            display: 'block',
            color: '#666',
            fontSize: '14px'
        },
        inputGroup: {
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
        },
        input: {
            padding: '10px 16px',
            border: '1px solid #ffd6e0',
            borderRadius: '8px',
            fontSize: '14px',
            width: '140px',
            transition: 'all 0.3s',
            backgroundColor: '#fff',
            color: '#333',
            ':focus': {
                borderColor: '#ff85a2',
                boxShadow: '0 0 0 3px rgba(255,133,162,0.1)',
                outline: 'none'
            }
        },
        select: {
            padding: '10px 16px',
            border: '1px solid #ffd6e0',
            borderRadius: '8px',
            fontSize: '14px',
            width: '220px',
            backgroundColor: '#fff',
            cursor: 'pointer',
            color: '#333'
        },
        option: {
            color: '#333',
            backgroundColor: '#fff'
        },
        button: {
            padding: '10px 24px',
            backgroundColor: '#ff85a2',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.3s',
            ':hover': {
                backgroundColor: '#ff9db5'
            }
        },
        toast: {
            position: 'fixed' as const,
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            backgroundColor: 'rgba(255,133,162,0.9)',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(255,133,162,0.2)',
            animation: 'fadeIn 0.3s'
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.title}>插件配置</div>

            <div style={styles.section}>
                <div style={styles.sectionTitle}>服务端口</div>
                <div style={styles.inputGroup}>
                    <input
                        type="number"
                        value={port}
                        onChange={e => setPort(Number(e.target.value))}
                        style={styles.input}
                        min="1"
                        max="65535"
                    />
                    <button
                        onClick={handlePortChange}
                        style={styles.button}
                    >
                        保存
                    </button>
                </div>
            </div>

            <div style={styles.section}>
                <div style={styles.sectionTitle}>歌词来源</div>
                <select
                    value={lyricSource}
                    onChange={handleSourceChange}
                    style={styles.select}
                >
                    {Object.entries(SOURCE_NAMES).map(([value, name]) => (
                        <option key={value} value={value} style={styles.option}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            <Monitor />

            {showSuccess && (
                <div style={{
                    position: 'fixed' as const,
                    bottom: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '12px 24px',
                    backgroundColor: 'rgba(255,133,162,0.9)',
                    color: '#fff',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxShadow: '0 4px 12px rgba(255,133,162,0.2)',
                    animation: 'fadeIn 0.3s'
                }}>
                    设置已保存
                </div>
            )}
        </div>
    );
}