import axios from 'axios';

// All requests go through vite proxy `/api/heygen` → `https://api.heygen.com`
const HEYGEN_BASE = '/api/heygen/v1';

export const getAccessToken = async (): Promise<{ data: { data: { token: string } } }> => {
    const response = await axios.post(`${HEYGEN_BASE}/streaming.create_token`, {}, {
        headers: {
            'x-api-key': import.meta.env.VITE_HEYGEN_API_KEY
        }
    });
    return response as any;
};

export interface HeyGenSessionInfo {
    session_id: string;
    url: string;
    access_token: string;
}

export const createStreamingSession = async (
    sessionToken: string,
    params: {
        avatar_name: string;
        voice_id: string;
        language?: string;
        emotion?: string;
        version?: string;
        quality?: 'low' | 'medium' | 'high';
        video_encoding?: 'H264' | 'VP8' | 'VP9';
        rate?: number;
    }
): Promise<HeyGenSessionInfo> => {
    const body = {
        quality: params.quality ?? 'high',
        avatar_name: params.avatar_name,
        voice: {
            voice_id: params.voice_id,
            rate: params.rate ?? 1.0,
        },
        language: params.language ?? 'English',
        emotion: params.emotion ?? 'Excited',
        version: params.version ?? 'v2',
        video_encoding: params.video_encoding ?? 'H264',
    };

    const { data } = await axios.post(`${HEYGEN_BASE}/streaming.new`, body, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
        },
    });

    return data.data as HeyGenSessionInfo;
};

export const startStreamingSession = async (
    sessionToken: string,
    sessionId: string
): Promise<void> => {
    await axios.post(`${HEYGEN_BASE}/streaming.start`, {
        session_id: sessionId,
    }, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
        },
    });
};

export const sendStreamingTask = async (
    sessionToken: string,
    sessionId: string,
    text: string,
    taskType: 'chat' | 'repeat' | 'interrupt' = 'chat'
): Promise<void> => {
    await axios.post(`${HEYGEN_BASE}/streaming.task`, {
        session_id: sessionId,
        text,
        task_type: taskType,
    }, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
        },
    });
};

export const stopStreamingSession = async (
    sessionToken: string,
    sessionId: string
): Promise<void> => {
    await axios.post(`${HEYGEN_BASE}/streaming.stop`, {
        session_id: sessionId,
    }, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
        },
    });
};