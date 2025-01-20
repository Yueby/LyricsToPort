import {
    DEFAULT_PORT,
    CONFIG_KEYS,
    LyricSource,
    SOURCE_NAMES,
    ConfigProps
} from "../const";

export function Config({ onSave, onLyricSourceChange, defaultPort, defaultLyricSource }: ConfigProps) {
    const [port, setPort] = React.useState(defaultPort);
    const [currentPort, setCurrentPort] = React.useState(defaultPort);
    const [lyricSource, setLyricSource] = React.useState(defaultLyricSource);
    const [currentSource, setCurrentSource] = React.useState(defaultLyricSource);
    const [showSuccess, setShowSuccess] = React.useState(false);

    React.useEffect(() => {
        // 读取保存的配置
        betterncm.app.readConfig(CONFIG_KEYS.PORT, defaultPort.toString())
            .then(savedPort => {
                setCurrentPort(Number(savedPort));
                setPort(Number(savedPort));
            });

        betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, defaultLyricSource.toString())
            .then(savedSource => {
                const source = Number(savedSource);
                setCurrentSource(source);
                setLyricSource(source);
            });
    }, []);

    const handleSave = () => {
        const portNum = Number(port);
        if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
            onSave(portNum);
            setCurrentPort(portNum);
            
            // 同时保存歌词来源
            onLyricSourceChange(lyricSource);
            setCurrentSource(lyricSource);

            // 显示成功提示
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000); // 2秒后隐藏
        }
    };

    return React.createElement('div', { style: { padding: '20px', color: '#000' } },
        // 输入区域
        React.createElement('div', { style: { display: 'flex', gap: '10px', marginBottom: '20px' } },
            React.createElement('select', {
                value: lyricSource,
                onChange: e => setLyricSource(Number(e.target.value)),
                style: {
                    padding: '5px',
                    flex: 1,
                    color: '#000'
                }
            },
                React.createElement('option', { value: LyricSource.REFINED }, SOURCE_NAMES[LyricSource.REFINED]),
                React.createElement('option', { value: LyricSource.LIBLYRIC }, SOURCE_NAMES[LyricSource.LIBLYRIC]),
                React.createElement('option', { value: LyricSource.INTERNAL }, SOURCE_NAMES[LyricSource.INTERNAL])
            ),
            React.createElement('input', {
                type: "number",
                value: port,
                onChange: (e) => setPort(Number(e.target.value)),
                style: {
                    padding: '5px',
                    flex: 1,
                    color: '#000'
                }
            }),
            React.createElement('button', {
                onClick: handleSave,
                style: {
                    padding: '5px 10px',
                    color: '#000',
                    position: 'relative'
                }
            }, "保存")
        ),
        // 当前值显示
        React.createElement('div', { 
            style: {
                fontSize: '12px',
                color: '#000'
            }
        },
            React.createElement('div', null, `当前歌词来源：${SOURCE_NAMES[currentSource]}`),
            React.createElement('div', null, `当前端口：${currentPort}`)
        ),
        // 成功提示
        showSuccess && React.createElement('div', {
            style: {
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '4px',
                fontSize: '12px',
                animation: 'fadeIn 0.3s'
            }
        }, "保存成功")
    );
}