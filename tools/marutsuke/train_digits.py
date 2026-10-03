#!/usr/bin/env python3
"""丸つけカメラ（marutsuke/）の手書き数字の読み取りモデルを作る（企画書 71・K86）。

公開ページは学習しない。このスクリプトは手元（またはこの作業環境）で 1 回だけ動かし、
出てきた marutsuke/digits-model.json をリポジトリに入れる。ブラウザはそれを読むだけ（推論は marutsuke/digits.js）。

データ: MNIST（Yann LeCun・Corinna Cortes。CC BY-SA 3.0）の学習用 60,000 字だけ。
        テスト用 10,000 字は学習に使わない（精度の数字と、Playwright の合成画像に使う）。
入手: https://ossci-datasets.s3.amazonaws.com/mnist/ の 4 つの .gz（README に sha256）。
使い方:
    python3 -m venv venv && ./venv/bin/pip install numpy torch --index-url https://download.pytorch.org/whl/cpu
    ./venv/bin/python tools/marutsuke/train_digits.py --mnist <.gz のフォルダ> --out marutsuke/digits-model.json

モデル: 28x28 → conv3x3(16)→pool → conv3x3(32)→pool → conv3x3(32)→pool → 全結合 288→10。約 1.7 万の重みを int8 に（層ごとに 1 つの倍率）。
撮った紙に合わせて、学習のときに 回転・拡大縮小・斜め・ずれ・線の太さ（太く/細く）・ぼかし・濃さ を毎回ランダムに変える。
"""
import argparse, base64, gzip, json, os, struct
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


def load_idx(path):
    with gzip.open(path, 'rb') as f:
        data = f.read()
    magic = struct.unpack('>I', data[:4])[0]
    if magic == 2051:
        n, r, c = struct.unpack('>III', data[4:16])
        return np.frombuffer(data, np.uint8, offset=16).reshape(n, r, c)
    n = struct.unpack('>I', data[4:8])[0]
    return np.frombuffer(data, np.uint8, offset=8)


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 16, 3, padding=1)
        self.c2 = nn.Conv2d(16, 32, 3, padding=1)
        self.c3 = nn.Conv2d(32, 32, 3, padding=1)
        self.fc = nn.Linear(32 * 3 * 3, 10)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.c1(x)), 2)   # 14
        x = F.max_pool2d(F.relu(self.c2(x)), 2)   # 7
        x = F.max_pool2d(F.relu(self.c3(x)), 2)   # 3（7→3 は端を落とす。JS も同じ）
        return self.fc(x.flatten(1))


def augment(x, g):
    """x: (B,1,28,28) 0..1。撮影した紙の字に近づける変形"""
    b = x.shape[0]
    ang = (torch.rand(b, generator=g) - 0.5) * 2 * np.deg2rad(14)
    sc = 0.82 + torch.rand(b, generator=g) * 0.3
    sh = (torch.rand(b, generator=g) - 0.5) * 0.4
    tx = (torch.rand(b, generator=g) - 0.5) * 0.16
    ty = (torch.rand(b, generator=g) - 0.5) * 0.16
    cos, sin = torch.cos(ang) / sc, torch.sin(ang) / sc
    theta = torch.stack([torch.stack([cos, -sin + sh, tx], 1), torch.stack([sin, cos, ty], 1)], 1)
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    x = F.grid_sample(x, grid, align_corners=False, padding_mode='zeros')
    r = torch.rand(b, generator=g).view(b, 1, 1, 1)
    dil = F.max_pool2d(x, 3, 1, 1)
    ero = -F.max_pool2d(-x, 3, 1, 1)
    x = torch.where(r < 0.25, dil, torch.where(r > 0.8, torch.maximum(ero, x * 0.5), x))
    k = torch.tensor([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=torch.float32).view(1, 1, 3, 3) / 16
    blur = F.conv2d(x, k, padding=1)
    rb = torch.rand(b, generator=g).view(b, 1, 1, 1)
    x = torch.where(rb < 0.35, blur, x)
    gain = 0.5 + torch.rand(b, generator=g).view(b, 1, 1, 1) * 0.5
    x = x * gain + torch.rand(x.shape, generator=g) * 0.06
    # 読む側と同じく、いちばん濃いところを 1 にそろえる
    m = x.flatten(1).max(1)[0].clamp(min=1e-3).view(b, 1, 1, 1)
    return (x / m).clamp(0, 1)


def quant(t):
    a = t.detach().numpy().astype(np.float32).ravel()
    s = float(np.abs(a).max() / 127) or 1.0
    q = np.clip(np.round(a / s), -127, 127).astype(np.int8)
    return {'shape': list(t.shape), 'scale': s, 'q': base64.b64encode(q.tobytes()).decode()}, q.astype(np.float32) * s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mnist', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=14)
    ap.add_argument('--seed', type=int, default=71)
    a = ap.parse_args()
    torch.manual_seed(a.seed)
    g = torch.Generator().manual_seed(a.seed)
    xtr = torch.tensor(load_idx(os.path.join(a.mnist, 'train-images-idx3-ubyte.gz')), dtype=torch.float32).unsqueeze(1) / 255
    ytr = torch.tensor(load_idx(os.path.join(a.mnist, 'train-labels-idx1-ubyte.gz')).astype(np.int64))
    xte = torch.tensor(load_idx(os.path.join(a.mnist, 't10k-images-idx3-ubyte.gz')), dtype=torch.float32).unsqueeze(1) / 255
    yte = torch.tensor(load_idx(os.path.join(a.mnist, 't10k-labels-idx1-ubyte.gz')).astype(np.int64))
    net = Net()
    opt = torch.optim.Adam(net.parameters(), 2e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 4e-3, total_steps=a.epochs * (len(xtr) // 128 + 1))
    for ep in range(a.epochs):
        net.train()
        perm = torch.randperm(len(xtr), generator=g)
        for i in range(0, len(xtr), 128):
            idx = perm[i:i + 128]
            xb = augment(xtr[idx], g)
            loss = F.cross_entropy(net(xb), ytr[idx], label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        net.eval()
        with torch.no_grad():
            m = xte.flatten(1).max(1)[0].view(-1, 1, 1, 1)
            acc = (net(xte / m).argmax(1) == yte).float().mean().item()
            acc_aug = (net(augment(xte, torch.Generator().manual_seed(1))).argmax(1) == yte).float().mean().item()
        print(f'epoch {ep + 1}: test {acc:.4f}  test(変形) {acc_aug:.4f}')
    # int8 にして、その重みで測り直す（ブラウザで動くのはこの重み）
    out = {'format': 'yorozu-digits-1', 'input': [28, 28], 'layers': {}}
    sd = net.state_dict()
    for k, v in sd.items():
        out['layers'][k], deq = quant(v)
        sd[k] = torch.tensor(deq).view(v.shape)
    net.load_state_dict(sd)
    with torch.no_grad():
        m = xte.flatten(1).max(1)[0].view(-1, 1, 1, 1)
        acc = (net(xte / m).argmax(1) == yte).float().mean().item()
    out['mnistTestAccuracy'] = round(acc, 4)
    out['data'] = 'MNIST training set (60,000), Yann LeCun & Corinna Cortes, CC BY-SA 3.0'
    out['license'] = 'CC BY-SA 3.0 (this weights file only; trained on MNIST)'
    with open(a.out, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('int8 test', acc, 'bytes', os.path.getsize(a.out))


if __name__ == '__main__':
    main()
