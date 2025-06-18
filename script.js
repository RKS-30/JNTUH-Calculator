// Set PDF.js worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', function () {
    // Tab Switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // PDF Processing Elements
    const pdfUpload = document.getElementById('pdf-upload');
    const processPdfBtn = document.getElementById('process-pdf');
    const pdfStatus = document.getElementById('pdf-status');
    const pdfLoading = document.getElementById('pdf-loading');


    const pdfResultsContainer = document.getElementById('pdf-results-container');
    const semestersContainer = document.getElementById('semesters-container');
    const finalResults = document.getElementById('final-results');

    // Manual Input Elements
    const manualSemestersContainer = document.getElementById('manual-semesters-container');
    const addSemesterBtn = document.getElementById('add-semester');
    const calculateManualBtn = document.getElementById('calculate-manual');
    const manualResultsContainer = document.getElementById('manual-results-container');
    const manualFinalResults = document.getElementById('manual-final-results');

    // Initialize with one semester
    addManualSemester();

    // Event Listeners
    processPdfBtn.addEventListener('click', processPdf);
    addSemesterBtn.addEventListener('click', addManualSemester);
    calculateManualBtn.addEventListener('click', calculateManualResults);

    async function processPdf() {
        const file = pdfUpload.files[0];
        if (!file) {
            showStatus('Please select a PDF file first.', 'error');
            return;
        }

        pdfLoading.classList.remove('hidden');   // Show "Processing PDF..."
        pdfStatus.classList.add('hidden');
        semestersContainer.innerHTML = '';
        finalResults.innerHTML = '';

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

            let allText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join(' ');
                allText += text + '\n';
            }

            const results = parseResults(allText);
            displayResults(results);
            showStatus('PDF processed successfully!', 'success');
            pdfResultsContainer.classList.remove('hidden');

        } catch (error) {
            console.error("Error processing PDF:", error);
            showStatus('Error processing PDF. Please check the file format.', 'error');
        } finally {
            pdfLoading.classList.add('hidden');   // ✅ hide "Processing PDF..."
        }
    }

    function parseResults(text) {
        const results = {
            semesters: [],
            studentInfo: {}
        };

        // Extract student info
        const nameMatch = text.match(/(?:NAME|NAME:)\s*([A-Z\s]+)/i);
        const rollNoMatch = text.match(/(?:Roll_No|HTNO:)\s*([A-Z0-9]+)/i);
        results.studentInfo.name = nameMatch ? nameMatch[1].trim() : '';
        results.studentInfo.rollNo = rollNoMatch ? rollNoMatch[1].trim() : '';

        // Split by semesters
        const semesterSections = splitBySemesters(text);

        // Process each semester
        semesterSections.forEach(section => {
            const semesterData = parseSemester(section.name, section.content);
            if (semesterData.subjects.length > 0) {
                results.semesters.push(semesterData);
            }
        });

        return results;
    }

    function splitBySemesters(text) {
        const semesterSections = [];
        const semesterRegex = /(\d-\d)\s*Results?|(?:Result of|Semester)\s*([IVXLCDM]+)/gi;

        let lastIndex = 0;
        let match;

        // Find all semester headers
        const semesterHeaders = [];
        while ((match = semesterRegex.exec(text)) !== null) {
            const semesterName = match[1] || match[2];
            semesterHeaders.push({
                name: semesterName,
                index: match.index
            });
        }

        // Extract content between headers
        for (let i = 0; i < semesterHeaders.length; i++) {
            const current = semesterHeaders[i];
            const next = semesterHeaders[i + 1];

            const start = current.index;
            const end = next ? next.index : text.length;
            const content = text.substring(start, end);

            semesterSections.push({
                name: current.name,
                content: content
            });
        }

        return semesterSections;
    }

    function parseSemester(name, content) {
        const semester = {
            name: name,
            subjects: [],
            sgpa: 0
        };

        // Find SGPA if present
        const sgpaMatch = content.match(/SGPA[:\s]*([\d.]+)/i);
        if (sgpaMatch) {
            semester.sgpa = parseFloat(sgpaMatch[1]);
        }

        // Match any line with a subject code, name, grade, and credit
        const subjectRegex = /([A-Z0-9]{5,10})\s+([A-Za-z0-9\s\-\&\(\)\/]+?)\s+(?:\d+\s+)?(?:\d+\s+)?(?:\d+\s+)?([OABCDF][\+\-]?|Absent|Ab)\s+(\d\.?\d?)/g;
        let match;

        while ((match = subjectRegex.exec(content)) !== null) {
            const code = match[1];
            const name = match[2].trim();
            const grade = match[3];
            const credit = parseFloat(match[4]);

            if (!isNaN(credit) && grade) {
                semester.subjects.push({ code, name, grade, credits: credit });
            }
        }

        return semester;
    }

    function displayResults(results) {

        // Display each semester
        let totalCredits = 0;
        let totalGradePoints = 0;

        results.semesters.forEach(semester => {
            let semesterCredits = 0;
            let semesterGradePoints = 0;

            const subjectsHTML = semester.subjects.map(subject => {
                const gradeValue = convertGradeToValue(subject.grade);
                const subjectGradePoints = subject.credits * gradeValue;

                semesterCredits += subject.credits;
                semesterGradePoints += subjectGradePoints;

                return `
                            <tr>
                                <td>${subject.code}</td>
                                <td>${subject.name}</td>
                                <td>${subject.credits}</td>
                                <td>${subject.grade} (${gradeValue})</td>
                            </tr>
                        `;
            }).join('');

            const calculatedSGPA = semesterCredits > 0 ? (semesterGradePoints / semesterCredits).toFixed(2) : 0;
            const percentage = (calculatedSGPA * 10).toFixed(2);

            totalCredits += semesterCredits;
            totalGradePoints += semesterGradePoints;

            const semesterHTML = `
                        <div class="semester">
                            <h3>Semester ${semester.name}</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Subject</th>
                                        <th>Credits</th>
                                        <th>Grade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${subjectsHTML}
                                </tbody>
                            </table>
                            <div class="result-item">
                                <span>Calculated SGPA:</span>
                                <span class="result-value">${calculatedSGPA}</span>
                            </div>
                            <div class="result-item">
                                <span>Percentage:</span>
                                <span class="result-value">${percentage}%</span>
                            </div>
                        </div>
                    `;

            semestersContainer.innerHTML += semesterHTML;
        });

        // Display final results
        const cgpa = totalCredits > 0 ? (totalGradePoints / totalCredits).toFixed(2) : 0;
        const percentage = (cgpa * 10).toFixed(2);

        finalResults.innerHTML = `
                    <div class="semester">
                        <h3>Final Results</h3>
                        <div class="result-item">
                            <span>Total Credits:</span>
                            <span class="result-value">${totalCredits}</span>
                        </div>
                        <div class="result-item">
                            <span>CGPA:</span>
                            <span class="result-value">${cgpa}</span>
                        </div>
                        <div class="result-item">
                            <span>Percentage (CGPA × 10):</span>
                            <span class="result-value">${percentage}%</span>
                        </div>
                    </div>
                `;
    }

    function addManualSemester() {
        const semesterCount = document.querySelectorAll('#manual-semesters-container .semester').length + 1;
        const semesterDiv = document.createElement('div');
        semesterDiv.className = 'semester';
        semesterDiv.innerHTML = `
                    <h3>Semester ${semesterCount}</h3>
                    <button class="remove-semester btn-danger">× Remove</button>
                    <table>
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Credits</th>
                                <th>Grade</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><input type="text" placeholder="Subject name"></td>
                                <td><input type="number" min="0" step="0.5" value="3"></td>
                                <td>
                                    <select>
                                        <option value="10">O (10)</option>
                                        <option value="9">A+ (9)</option>
                                        <option value="8">A (8)</option>
                                        <option value="7">B+ (7)</option>
                                        <option value="6">B (6)</option>
                                        <option value="5">C (5)</option>
                                        <option value="0">F (0)</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="add-subject btn-success">+</button>
                                    <button class="remove-subject btn-danger">-</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                `;

        manualSemestersContainer.appendChild(semesterDiv);

        // Add event listeners
        semesterDiv.querySelector('.remove-semester').addEventListener('click', function () {
            if (document.querySelectorAll('#manual-semesters-container .semester').length > 1) {
                semesterDiv.remove();
                updateSemesterNumbers();
            } else {
                alert("You need at least one semester!");
            }
        });

        semesterDiv.querySelector('.add-subject').addEventListener('click', function () {
            addSubjectToTable(this.closest('tbody'));
        });

        semesterDiv.querySelector('.remove-subject').addEventListener('click', function () {
            const row = this.closest('tr');
            if (row.parentElement.children.length > 1) {
                row.remove();
            } else {
                alert("You need at least one subject!");
            }
        });
    }

    function addSubjectToTable(tbody) {
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
                    <td><input type="text" placeholder="Subject name"></td>
                    <td><input type="number" min="0" step="0.5" value="3"></td>
                    <td>
                        <select>
                            <option value="10">O (10)</option>
                            <option value="9">A+ (9)</option>
                            <option value="8">A (8)</option>
                            <option value="7">B+ (7)</option>
                            <option value="6">B (6)</option>
                            <option value="5">C (5)</option>
                            <option value="0">F (0)</option>
                        </select>
                    </td>
                    <td>
                        <button class="add-subject btn-success">+</button>
                        <button class="remove-subject btn-danger">-</button>
                    </td>
                `;

        tbody.appendChild(newRow);

        newRow.querySelector('.add-subject').addEventListener('click', function () {
            addSubjectToTable(this.closest('tbody'));
        });

        newRow.querySelector('.remove-subject').addEventListener('click', function () {
            const row = this.closest('tr');
            if (row.parentElement.children.length > 1) {
                row.remove();
            } else {
                alert("You need at least one subject!");
            }
        });
    }

    function updateSemesterNumbers() {
        document.querySelectorAll('#manual-semesters-container .semester').forEach((semester, index) => {
            semester.querySelector('h3').textContent = `Semester ${index + 1}`;
        });
    }

    function calculateManualResults() {
        let totalCredits = 0;
        let totalGradePoints = 0;
        let semesterResults = [];

        document.querySelectorAll('#manual-semesters-container .semester').forEach((semesterDiv, index) => {
            let semesterCredits = 0;
            let semesterGradePoints = 0;

            semesterDiv.querySelectorAll('tbody tr').forEach(row => {
                const credits = parseFloat(row.querySelector('td:nth-child(2) input').value) || 0;
                const grade = parseFloat(row.querySelector('td:nth-child(3) select').value) || 0;

                semesterCredits += credits;
                semesterGradePoints += credits * grade;
            });

            const sgpa = semesterCredits > 0 ? (semesterGradePoints / semesterCredits).toFixed(2) : 0;
            const percentage = (sgpa * 10).toFixed(2);

            semesterResults.push({
                semester: index + 1,
                credits: semesterCredits,
                gradePoints: semesterGradePoints,
                sgpa: sgpa,
                percentage: percentage
            });

            totalCredits += semesterCredits;
            totalGradePoints += semesterGradePoints;
        });

        const cgpa = totalCredits > 0 ? (totalGradePoints / totalCredits).toFixed(2) : 0;
        const percentage = (cgpa * 10).toFixed(2);

        let resultsHTML = '<div class="semester"><h3>Results</h3>';

        semesterResults.forEach(result => {
            resultsHTML += `
                        <div class="result-item">
                            <span>Semester ${result.semester} SGPA:</span>
                            <span class="result-value">${result.sgpa}</span>
                        </div>
                        <div class="result-item">
                            <span>Semester ${result.semester} Percentage:</span>
                            <span class="result-value">${result.percentage}%</span>
                        </div>
                    `;
        });

        resultsHTML += `
                    <div class="result-item">
                        <span>Total Credits:</span>
                        <span class="result-value">${totalCredits}</span>
                    </div>
                    <div class="result-item">
                        <span>CGPA:</span>
                        <span class="result-value">${cgpa}</span>
                    </div>
                    <div class="result-item">
                        <span>Percentage (CGPA × 10):</span>
                        <span class="result-value">${percentage}%</span>
                    </div>
                </div>`;

        manualFinalResults.innerHTML = resultsHTML;
        manualResultsContainer.classList.remove('hidden');
    }

    function convertGradeToValue(grade) {
        // Correct JNTUH grade point values
        if (grade === 'B+') return 7;
        if (grade === 'B') return 6;
        if (grade === 'A+') return 9;
        if (grade === 'A') return 8;

        const gradeMap = {
            'O': 10,
            'C': 5,
            'F': 0,
            'ABS': 0,
            'Ab': 0
        };
        return gradeMap[grade] || 0;
    }

    function showStatus(message, type) {
        const statusDiv = document.getElementById('pdf-status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.classList.remove('hidden');
    }
});
