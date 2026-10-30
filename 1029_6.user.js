// ==UserScript==
// @name         이미지 처리 사이드바 (통합 이름 변경 & 드래그 앤 드롭 지원)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  EXIF 제거 기능 삭제, 순차 이름 변경 & 단어 찾아 바꾸기 통합, 드래그 앤 드롭 영역 추가
// @author       호씨나
// @match        *://*/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (window.self !== window.top) return;
    const currentDomain = window.location.hostname;
    if (currentDomain.includes('chatgpt.com') || currentDomain.includes('google.com')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'img-processor-sidebar';
    sidebar.style.cssText = `
        position: fixed;
        top: 0;
        right: -450px;
        width: 450px;
        height: 100vh;
        background-color: #ffffff;
        box-shadow: -2px 0 10px rgba(0,0,0,0.2);
        z-index: 9999999;
        transition: right 0.3s ease-in-out;
        font-family: 'Malgun Gothic', sans-serif;
        color: #333;
        box-sizing: border-box;
    `;

    const toggleBtn = document.createElement('div');
    toggleBtn.innerText = '이미지\n도구';
    toggleBtn.style.cssText = `
        position: absolute;
        top: 50%;
        left: -50px;
        width: 50px;
        height: 80px;
        background-color: #007bff;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        border-radius: 8px 0 0 8px;
        box-shadow: -2px 0 5px rgba(0,0,0,0.2);
        transform: translateY(-50%);
        user-select: none;
        opacity: 0.4;
        transition: opacity 0.2s;
    `;

    toggleBtn.addEventListener('mouseenter', () => toggleBtn.style.opacity = '1');
    toggleBtn.addEventListener('mouseleave', () => toggleBtn.style.opacity = '0.4');

    const content = document.createElement('div');
    content.style.cssText = `
        padding: 15px;
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
    `;

    content.innerHTML = `
        <h3 style="margin-top:0; margin-bottom: 10px; font-size:16px;">NovelAI Inspect & 파일명 정리</h3>

        <iframe src="https://novelai.net/inspect" style="width: 100%; height: 350px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 15px; flex-shrink: 0;"></iframe>

        <div id="ip-drop-zone" style="border: 2px dashed #007bff; border-radius: 8px; padding: 20px; text-align: center; background-color: #f0f8ff; margin-bottom: 10px; cursor: pointer; transition: background-color 0.2s;">
            <p style="margin: 0; font-size: 13px; font-weight: bold; color: #007bff;">
                여기로 이미지 파일들을 끌어다 놓으세요<br>
                <span style="font-size: 11px; font-weight: normal; color: #555;">(클릭해서 개별 파일을 선택할 수도 있습니다)</span>
            </p>
            <input type="file" id="ip-fileInput" multiple accept="image/*" style="display: none;">
        </div>

        <div style="margin-bottom: 10px;">
            <label style="display: block; cursor: pointer; padding: 10px; background-color: #17a2b8; color: white; text-align: center; border-radius: 4px; font-size: 13px; font-weight: bold;">
                폴더 단위로 한 번에 선택하기 (최상위만)
                <input type="file" id="ip-folderInput" webkitdirectory style="display: none;">
            </label>
        </div>

        <!-- 통합 UI: 이름 변경 방식 선택 (라디오 버튼) -->
        <div style="margin-bottom: 15px; background: #f8f9fa; padding: 12px; border: 1px solid #ddd; border-radius: 4px;">
            <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">이름 변경 방식 선택</div>

            <div style="margin-bottom: 10px; font-size: 12px;">
                <label style="margin-right: 15px; cursor: pointer;">
                    <input type="radio" name="renameMode" value="sequential" checked> 일괄 순차 변경
                </label>
                <label style="cursor: pointer;">
                    <input type="radio" name="renameMode" value="replace"> 특정 단어 찾아 바꾸기
                </label>
            </div>

            <!-- 1. 일괄 순차 변경 UI -->
            <div id="ip-ui-sequential" style="padding-top: 10px; border-top: 1px dashed #ccc;">
                <input type="text" id="ip-baseName" placeholder="기본 이름 (입력 안하면 'image' 적용)" style="width: 100%; padding: 6px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; font-family: inherit; font-size: 12px;">
                <select id="ip-seqType" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; font-family: inherit; font-size: 12px;">
                    <option value="number">숫자 순차적용 (1, 2, 3...)</option>
                    <option value="alphabet">영어 순차적용 (A, B, C...)</option>
                </select>
            </div>

            <!-- 2. 특정 단어 찾아 바꾸기 UI -->
            <div id="ip-ui-replace" style="display: none; padding-top: 10px; border-top: 1px dashed #ccc;">
                <input type="text" id="ip-findWord" placeholder="찾을 단어 (예: 김철수)" style="width: 100%; padding: 6px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; font-family: inherit; font-size: 12px;">
                <input type="text" id="ip-replaceWord" placeholder="바꿀 단어 (예: 하동구)" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; font-family: inherit; font-size: 12px;">
            </div>
        </div>

        <div id="ip-count-display" style="text-align: center; font-size: 13px; font-weight: bold; color: #dc3545; margin-bottom: 15px; background: #f8d7da; padding: 8px; border-radius: 4px;">
            선택된 파일이 없습니다.
        </div>

        <button id="ip-processBtn" style="width: 100%; padding: 12px; background-color: #28a745; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 10px;">작업 시작 (이름 변경)</button>

        <div id="ip-log" style="flex-grow: 1; min-height: 120px; background-color: #f8f9fa; border: 1px solid #ddd; padding: 10px; overflow-y: auto; font-size: 11px; white-space: pre-wrap;">대기 중...\n</div>
    `;

    sidebar.appendChild(toggleBtn);
    sidebar.appendChild(content);
    document.body.appendChild(sidebar);

    let isOpen = false;
    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        sidebar.style.right = isOpen ? '0' : '-450px';
    });

    const radios = sidebar.querySelectorAll('input[name="renameMode"]');
    const uiSequential = sidebar.querySelector('#ip-ui-sequential');
    const uiReplace = sidebar.querySelector('#ip-ui-replace');

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'sequential') {
                uiSequential.style.display = 'block';
                uiReplace.style.display = 'none';
            } else {
                uiSequential.style.display = 'none';
                uiReplace.style.display = 'block';
            }
        });
    });

    const logDiv = sidebar.querySelector('#ip-log');
    function addLog(msg) {
        logDiv.textContent += msg + '\n';
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    let finalValidFiles = [];

    function processFileList(filesArray) {
        const allFilesMap = new Map();

        finalValidFiles.forEach(f => allFilesMap.set(f.name + '_' + f.size, f));

        filesArray.forEach(file => {
            if (file.webkitRelativePath) {
                const slashes = (file.webkitRelativePath.match(/\//g) || []).length;
                if (slashes > 1) return;
            }
            if (file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
                allFilesMap.set(file.name + '_' + file.size, file);
            }
        });

        finalValidFiles = Array.from(allFilesMap.values());
        updateCountDisplay();
    }

    function updateCountDisplay() {
        const countDisplay = sidebar.querySelector('#ip-count-display');
        if (finalValidFiles.length > 0) {
            countDisplay.style.color = '#155724';
            countDisplay.style.backgroundColor = '#d4edda';
            countDisplay.innerText = '실제 처리 대상: ' + finalValidFiles.length + '개 파일 준비됨';
        } else {
            countDisplay.style.color = '#dc3545';
            countDisplay.style.backgroundColor = '#f8d7da';
            countDisplay.innerText = '선택된 유효 파일이 없습니다.';
        }
    }

    sidebar.querySelector('#ip-fileInput').addEventListener('change', (e) => processFileList(Array.from(e.target.files)));
    sidebar.querySelector('#ip-folderInput').addEventListener('change', (e) => processFileList(Array.from(e.target.files)));

    const dropZone = sidebar.querySelector('#ip-drop-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.backgroundColor = '#cce5ff'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.backgroundColor = '#f0f8ff'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#f0f8ff';
        if (e.dataTransfer.files) processFileList(Array.from(e.dataTransfer.files));
    });
    dropZone.addEventListener('click', () => sidebar.querySelector('#ip-fileInput').click());

    function getAlphabet(index) {
        let result = '';
        let num = index;
        while (num >= 0) {
            result = String.fromCharCode((num % 26) + 65) + result;
            num = Math.floor(num / 26) - 1;
        }
        return result;
    }

    sidebar.querySelector('#ip-processBtn').addEventListener('click', async () => {
        if (finalValidFiles.length === 0) {
            alert('처리할 파일이 없습니다. 파일을 먼저 선택해주세요.');
            return;
        }

        const mode = sidebar.querySelector('input[name="renameMode"]:checked').value;
        const zip = new JSZip();
        addLog(`--- 작업 시작 [${mode === 'sequential' ? '일괄 순차' : '단어 바꾸기'}]: 총 ${finalValidFiles.length}개 파일 ---`);

        let processedCount = 0;

        for (let i = 0; i < finalValidFiles.length; i++) {
            const file = finalValidFiles[i];
            try {
                let originalName = file.name;
                let lastDot = originalName.lastIndexOf('.');
                let nameOnly = lastDot !== -1 ? originalName.substring(0, lastDot) : originalName;
                let extension = lastDot !== -1 ? originalName.substring(lastDot) : '';

                let newName = "";

                if (mode === 'sequential') {

                    const baseName = sidebar.querySelector('#ip-baseName').value.trim() || 'image';
                    const seqType = sidebar.querySelector('#ip-seqType').value;
                    let suffix = seqType === 'number' ? (i + 1) : getAlphabet(i);
                    newName = `${baseName}_${suffix}${extension}`;

                } else {

                    const findWord = sidebar.querySelector('#ip-findWord').value;
                    const replaceWord = sidebar.querySelector('#ip-replaceWord').value;
                    let newNameOnly = nameOnly;

                    if (findWord !== "") {
                        newNameOnly = nameOnly.split(findWord).join(replaceWord);
                    }
                    newName = newNameOnly + extension;
                }

                zip.file(newName, file);
                addLog(`[변경] ${originalName} -> ${newName}`);
                processedCount++;
            } catch (error) {
                addLog('[오류] ' + file.name + ' 처리 실패');
            }
        }

        if (processedCount === 0) return;
        addLog('압축 중입니다. 잠시만 기다려주세요...');

        zip.generateAsync({ type: 'blob' }).then(function(content) {
            saveAs(content, 'renamed_images.zip');
            addLog('ZIP 파일 다운로드 완료!');

            finalValidFiles = [];
            updateCountDisplay();
            sidebar.querySelector('#ip-fileInput').value = '';
            sidebar.querySelector('#ip-folderInput').value = '';
        });
    });
})();