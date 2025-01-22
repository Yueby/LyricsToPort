import { MonitorState } from '../const';
import { monitorEvents } from '../utils/events';

export function Monitor() {
    const [state, setState] = React.useState<MonitorState>({});

    React.useEffect(() => {
        const unsubscribe = monitorEvents.subscribe(newState => {
            setState(prev => ({ ...prev, ...newState }));
        });
        return () => unsubscribe();
    }, []);

    const styles = {
        container: {
            padding: '24px',
            backgroundColor: '#fff',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            maxWidth: '900px',
            margin: '20px auto'
        },
        title: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#ff85a2',  // 粉色标题
            marginBottom: '24px',
            paddingBottom: '12px',
            borderBottom: '2px solid #ffd6e0'  // 浅粉色边框
        },
        grid: {
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'  // 自适应列数
        },
        section: {
            backgroundColor: '#fff9fa',  // 超浅粉色背景
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #ffe4e8',  // 浅粉色边框
            transition: 'transform 0.2s ease',
            ':hover': {
                transform: 'translateY(-2px)'
            }
        },
        sectionTitle: {
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#ff85a2',  // 粉色标题
            marginBottom: '16px'
        },
        content: {
            color: '#4a4a4a',
            lineHeight: '1.8'
        },
        progressBar: {
            width: '100%',
            height: '6px',
            backgroundColor: '#ffe4e8',  // 浅粉色背景
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '12px'
        },
        progressFill: (percent: number) => ({
            width: `${percent}%`,
            height: '100%',
            backgroundColor: '#ff85a2',  // 粉色进度条
            transition: 'width 0.3s ease'
        }),
        label: {
            color: '#888',
            fontSize: '14px',
            minWidth: '60px',
            display: 'inline-block'
        },
        value: {
            color: '#4a4a4a',
            marginLeft: '12px',
            fontSize: '14px'
        },
        lyricLine: (isActive: boolean) => ({
            padding: '6px 0',
            color: isActive ? '#ff85a2' : '#666',  // 粉色高亮
            transition: 'all 0.3s ease',
            fontSize: '14px',
            fontWeight: isActive ? '500' : 'normal'
        }),
        playState: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            color: '#ff85a2'  // 粉色状态
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.title}>播放状态监视器</div>
            <div style={styles.grid}>
                {/* 歌曲信息 */}
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>歌曲信息</div>
                    {state.song ? (
                        <div style={styles.content}>
                            <div><span style={styles.label}>标题:</span><span style={styles.value}>{state.song.name}</span></div>
                            <div><span style={styles.label}>歌手:</span><span style={styles.value}>{state.song.artists.map(a => a.name).join(' / ')}</span></div>
                            <div><span style={styles.label}>专辑:</span><span style={styles.value}>{state.song.album.name}</span></div>
                            {state.song.alias.length > 0 && (
                                <div><span style={styles.label}>别名:</span><span style={styles.value}>{state.song.alias.join(' / ')}</span></div>
                            )}
                        </div>
                    ) : <div style={styles.content}>无播放信息</div>}
                </div>

                {/* 播放进度 */}
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>播放进度</div>
                    {state.progress ? (
                        <div style={styles.content}>
                            <div style={styles.progressBar}>
                                <div style={styles.progressFill((state.progress.time / state.progress.duration) * 100)} />
                            </div>
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{Math.floor(state.progress.time / 1000)}s</span>
                                <span>{Math.floor(state.progress.duration / 1000)}s</span>
                            </div>
                        </div>
                    ) : <div style={styles.content}>未播放</div>}
                </div>

                {/* 歌词显示 */}
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>歌词</div>
                    <div style={styles.content}>
                        {state.lyrics?.lines.map((line, index) => (
                            <div
                                key={index}
                                style={styles.lyricLine(line.time <= (state.progress?.time || 0) &&
                                    (line.time + (line.duration || 0)) >= (state.progress?.time || 0))}
                            >
                                {line.originalLyric}
                            </div>
                        )) || '无歌词'}
                    </div>
                </div>

                {/* 播放状态 */}
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>播放状态</div>
                    <div style={styles.content}>
                        <div style={styles.playState}>
                            {state.playState === 'resume' ? '▶ 播放中' : '⏸ 已暂停'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 