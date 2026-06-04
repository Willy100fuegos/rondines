document.addEventListener('alpine:init', () => {
    Alpine.data('adminDashboard', () => ({
        isLoggedIn: false,
        adminUser: null,
        loginForm: { username: '', password: '', isLoading: false, error: '' },
        apiUrlAdminAuth: 'https://rondines.goratrack.link/api/admin_auth.php',

        currentTab: 'checkpoints',
        apiUrl: 'https://rondines.goratrack.link/api/admin.php',
        apiUrlReports: 'https://rondines.goratrack.link/api/reports.php',

        tenants: [], selectedTenantId: '', checkpoints: [], auditLogs: [], guards: [],
        incidentReports: [], reportsKpiTotal: 0, reportsKpiTopCategory: '-', reportsKpiTopDay: '-',

        isLoadingTenants: false, isNewServiceModalOpen: false, isNewGuardModalOpen: false, isNewPointModalOpen: false, isDeleteModalOpen: false, isModalOpen: false,
        isPhotoModalOpen: false, selectedPhotoUrl: '',
        newService: { name: '' }, newGuard: { name: '', pin: '' }, newPoint: { name: '', lat: '', lng: '', tolerance: 50 },
        deleteType: '', itemToDelete: null, selectedCheckpoint: {}, qrInstance: null, systemError: '',

        auditCurrentPage: 1,
        auditItemsPerPage: 25,
        isRefreshingAudits: false,

        mapInstance: null,
        markerInstance: null,
        selectedAuditForMap: null,
        checkpointsMapInstance: null,
        checkpointMarkersLayer: null,

        startDate: '', endDate: '', analyticsData: [], dailyMetrics: [], rhythms: [],
        kpiTotal: 0, kpiPromedio: 0, kpiPuntos: 0, kpiRounds: 0, chartInstance: null, maxHeat: 1, heatMap: {}, chartHeight: 256,

        get allowedTenants() {
            if (!this.tenants) return [];
            if (this.adminUser?.role === 'superadmin' || this.adminUser?.role === 'operaciones') return this.tenants;
            if (this.adminUser?.corporate_id) {
                return this.tenants.filter(t => String(t.corporate_id) === String(this.adminUser.corporate_id));
            }
            return this.tenants.filter(t => String(t.id) === String(this.adminUser.tenant_id));
        },

        async init() {
            const storedAdmin = localStorage.getItem('gora_admin');
            if (storedAdmin) {
                this.adminUser = JSON.parse(storedAdmin);
                this.isLoggedIn = true;
                this.bootDashboard();
            }
        },

        async doLogin() {
            this.loginForm.isLoading = true;
            this.loginForm.error = '';
            try {
                const res = await fetch(this.apiUrlAdminAuth, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.loginForm.username, password: this.loginForm.password })
                });
                const data = await res.json();

                if (res.ok && data.status === 'success') {
                    this.adminUser = data.user;
                    this.isLoggedIn = true;
                    localStorage.setItem('gora_admin', JSON.stringify(data.user));

                    if (this.adminUser.role === 'client') {
                        this.currentTab = 'checkpoints';
                    }

                    this.bootDashboard();
                } else {
                    this.loginForm.error = data.message || 'Credenciales incorrectas';
                }
            } catch (e) {
                this.loginForm.error = 'Error de conexión con el servidor.';
            } finally {
                this.loginForm.isLoading = false;
            }
        },

        logout() {
            this.isLoggedIn = false;
            this.adminUser = null;
            localStorage.removeItem('gora_admin');
            this.loginForm.username = '';
            this.loginForm.password = '';
        },

        async bootDashboard() {
            try {
                const today = new Date();
                const lastWeek = new Date(today);
                lastWeek.setDate(today.getDate() - 7);

                const offset = today.getTimezoneOffset() * 60000;
                this.endDate = (new Date(today - offset)).toISOString().split('T')[0];
                this.startDate = (new Date(lastWeek - offset)).toISOString().split('T')[0];

                for (let i = 0; i < 7; i++) {
                    this.heatMap[i] = Array(24).fill(0);
                }

                await this.loadTenants();
                this.initWatchers();
            } catch (e) {
                console.error("Error en inicialización:", e);
                this.systemError = "Fallo interno al iniciar el sistema. " + e.message;
            }
        },

        initWatchers() {
            this.$watch('currentTab', value => {
                if (value === 'audits') {
                    this.$nextTick(() => { this.initMap(); });
                }
                if (value === 'checkpoints') {
                    this.$nextTick(() => {
                        this.initCheckpointsMap();
                        this.drawCheckpointsOnMap();
                    });
                }
                if (value === 'reports') {
                    this.$nextTick(() => { this.loadReports(); });
                }
                if (value === 'analytics') {
                    this.$nextTick(() => { if (this.analyticsData.length > 0) this.processAnalytics(); });
                }
            });
        },

        switchTab(tabName) {
            this.currentTab = tabName;
            if (tabName !== 'services') {
                this.reloadContext();
            }
        },

        async loadTenants() {
            this.isLoadingTenants = true;
            this.systemError = '';
            try {
                const res = await fetch(`${this.apiUrl}?action=services&_t=${Date.now()}`);
                const textData = await res.text();

                try {
                    const data = JSON.parse(textData);
                    if (res.ok && Array.isArray(data)) {
                        this.tenants = data;

                        if (this.adminUser?.role === 'client') {
                            if (this.adminUser.corporate_id) {
                                if (!this.selectedTenantId && this.allowedTenants.length > 0) {
                                    this.selectedTenantId = String(this.allowedTenants[0].id);
                                }
                            } else {
                                this.selectedTenantId = String(this.adminUser.tenant_id);
                            }
                            this.reloadContext();
                        } else if (this.tenants.length > 0) {
                            if (!this.selectedTenantId) {
                                this.selectedTenantId = String(this.tenants[0].id);
                            }
                            this.reloadContext();
                        } else {
                            this.selectedTenantId = '';
                            this.switchTab('services');
                        }
                    } else {
                        this.systemError = data.message || "La base de datos devolvió un formato no válido.";
                    }
                } catch (parseError) {
                    this.systemError = "Error en el servidor PHP: " + textData.substring(0, 100);
                }
            } catch (e) {
                this.systemError = "No se pudo conectar con el servidor.";
            } finally {
                this.isLoadingTenants = false;
            }
        },

        getTenantName() {
            const tenant = this.tenants.find(t => String(t.id) === String(this.selectedTenantId));
            return tenant ? tenant.name : 'Cargando...';
        },

        reloadContext() {
            if (!this.selectedTenantId) return;
            if (this.currentTab === 'guards') this.loadGuards();
            if (this.currentTab === 'checkpoints') this.loadCheckpoints();
            if (this.currentTab === 'audits') this.loadAudits();
            if (this.currentTab === 'reports') this.loadReports();
            if (this.currentTab === 'analytics') this.loadAnalytics();
        },

        async loadGuards() {
            try {
                const res = await fetch(`${this.apiUrl}?action=guards&tenant_id=${this.selectedTenantId}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    this.guards = Array.isArray(data) ? data : [];
                }
            } catch (e) { }
        },

        async loadCheckpoints() {
            try {
                const res = await fetch(`${this.apiUrl}?tenant_id=${this.selectedTenantId}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    this.checkpoints = Array.isArray(data) ? data : [];

                    if (this.currentTab === 'checkpoints') {
                        this.$nextTick(() => {
                            this.initCheckpointsMap();
                            this.drawCheckpointsOnMap();
                        });
                    }
                }
            } catch (e) { }
        },

        async loadAudits() {
            try {
                const res = await fetch(`${this.apiUrl}?action=audits&tenant_id=${this.selectedTenantId}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    this.auditLogs = Array.isArray(data) ? data : [];
                    this.auditCurrentPage = 1;

                    if (this.currentTab === 'audits') {
                        this.$nextTick(() => { this.initMap(); });
                    }
                }
            } catch (e) { }
        },

        async loadReports() {
            if (!this.selectedTenantId || !this.startDate || !this.endDate) return;
            try {
                const res = await fetch(`${this.apiUrlReports}?tenant_id=${this.selectedTenantId}&start=${this.startDate}&end=${this.endDate}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    this.incidentReports = Array.isArray(data) ? data : [];
                    this.calculateReportKpis();
                }
            } catch (e) { }
        },

        calculateReportKpis() {
            this.reportsKpiTotal = this.incidentReports.length;
            if (this.reportsKpiTotal === 0) {
                this.reportsKpiTopCategory = '-';
                this.reportsKpiTopDay = '-';
                return;
            }

            const categoryCounts = {};
            const dayCounts = {};

            this.incidentReports.forEach(rep => {
                categoryCounts[rep.category] = (categoryCounts[rep.category] || 0) + 1;

                const d = new Date(rep.captured_at.replace(/-/g, '/'));
                if (!isNaN(d.getTime())) {
                    const dayName = d.toLocaleDateString('es-ES', { weekday: 'long' });
                    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
                }
            });

            this.reportsKpiTopCategory = Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b);

            if (Object.keys(dayCounts).length > 0) {
                const topDay = Object.keys(dayCounts).reduce((a, b) => dayCounts[a] > dayCounts[b] ? a : b);
                this.reportsKpiTopDay = topDay.charAt(0).toUpperCase() + topDay.slice(1);
            } else {
                this.reportsKpiTopDay = '-';
            }
        },

        formatDate(datetimeStr) {
            if (!datetimeStr) return '';
            const d = new Date(datetimeStr.replace(/-/g, '/'));
            return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
        },

        formatTime(datetimeStr) {
            if (!datetimeStr) return '';
            const d = new Date(datetimeStr.replace(/-/g, '/'));
            return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        },

        openPhotoModal(urlPath) {
            this.selectedPhotoUrl = 'https://rondines.goratrack.link/' + urlPath;
            this.isPhotoModalOpen = true;
        },

        async refreshAudits() {
            this.isRefreshingAudits = true;
            await this.loadAudits();
            this.selectedAuditForMap = null;
            if (this.markerInstance && this.mapInstance) {
                this.mapInstance.removeLayer(this.markerInstance);
                this.markerInstance = null;
            }
            setTimeout(() => { this.isRefreshingAudits = false; }, 500);
        },

        get paginatedAudits() {
            if (!this.auditLogs || !Array.isArray(this.auditLogs)) return [];
            const start = (this.auditCurrentPage - 1) * this.auditItemsPerPage;
            return this.auditLogs.slice(start, start + this.auditItemsPerPage);
        },

        get totalAuditPages() {
            if (!this.auditLogs || !Array.isArray(this.auditLogs)) return 1;
            return Math.ceil(this.auditLogs.length / this.auditItemsPerPage) || 1;
        },

        initMap() {
            if (this.currentTab !== 'audits') return;
            if (!document.getElementById('auditMap')) return;

            if (!this.mapInstance) {
                this.mapInstance = L.map('auditMap').setView([18.1495, -94.4175], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(this.mapInstance);
            } else {
                this.mapInstance.invalidateSize();
            }
        },

        viewOnMap(audit) {
            if (!this.mapInstance || !audit.gps_lat) return;
            this.selectedAuditForMap = audit;

            const lat = parseFloat(audit.gps_lat);
            const lng = parseFloat(audit.gps_lng);
            const isAlert = audit.is_geofence_valid == 0;

            if (this.markerInstance) {
                this.mapInstance.removeLayer(this.markerInstance);
            }

            const markerColor = isAlert ? 'red' : 'blue';
            const customIcon = L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            this.markerInstance = L.marker([lat, lng], { icon: customIcon }).addTo(this.mapInstance);
            const popupContent = `
                <div style="font-family: sans-serif; min-width: 200px;">
                    <h4 style="font-weight: bold; font-size: 14px; margin-bottom: 5px; color: ${isAlert ? '#dc2626' : '#1e40af'}">
                        ${isAlert ? '⚠️ Alerta de Rango' : '✓ Escaneo Válido'}
                    </h4>
                    <p style="margin: 0; font-size: 12px;"><b>Punto:</b> ${audit.checkpoint_name || 'N/A'}</p>
                    <p style="margin: 0; font-size: 12px;"><b>Hora:</b> ${audit.captured_at}</p>
                    <p style="margin: 0; font-size: 12px; border-top: 1px solid #ccc; padding-top: 5px; margin-top: 5px;">
                        <b>Distancia:</b> ${parseFloat(audit.distance_m).toFixed(1)} metros del origen.
                    </p>
                </div>
            `;
            this.markerInstance.bindPopup(popupContent).openPopup();
            this.mapInstance.flyTo([lat, lng], 17, { duration: 1.5 });
        },

        initCheckpointsMap() {
            if (this.currentTab !== 'checkpoints') return;
            if (!document.getElementById('checkpointsMap')) return;

            if (!this.checkpointsMapInstance) {
                this.checkpointsMapInstance = L.map('checkpointsMap').setView([18.1495, -94.4175], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(this.checkpointsMapInstance);

                this.checkpointMarkersLayer = L.featureGroup().addTo(this.checkpointsMapInstance);
            } else {
                this.checkpointsMapInstance.invalidateSize();
            }
        },

        drawCheckpointsOnMap() {
            if (!this.checkpointsMapInstance || !this.checkpointMarkersLayer) return;

            this.checkpointMarkersLayer.clearLayers();
            let hasValidPoints = false;

            this.checkpoints.forEach(cp => {
                if (cp.expected_lat && cp.expected_lng) {
                    hasValidPoints = true;
                    const lat = parseFloat(cp.expected_lat);
                    const lng = parseFloat(cp.expected_lng);

                    const customIcon = L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                    });

                    const marker = L.marker([lat, lng], { icon: customIcon });

                    const popupContent = `
                        <div style="font-family: sans-serif; min-width: 150px;">
                            <h4 style="font-weight: bold; font-size: 14px; margin-bottom: 5px; color: #1e40af">
                                📍 ${cp.name}
                            </h4>
                            <p style="margin: 0; font-size: 11px; color: #64748b; font-family: monospace;">UUID: ${cp.uuid}</p>
                            <p style="margin: 0; font-size: 11px; margin-top: 4px;"><b>Tolerancia:</b> ${cp.radius_tolerance}m</p>
                        </div>
                    `;
                    marker.bindPopup(popupContent);
                    this.checkpointMarkersLayer.addLayer(marker);
                }
            });

            if (hasValidPoints) {
                this.checkpointsMapInstance.fitBounds(this.checkpointMarkersLayer.getBounds(), { padding: [30, 30] });
            } else {
                this.checkpointsMapInstance.setView([18.1495, -94.4175], 13);
            }
        },

        focusCheckpointOnMap(cp) {
            if (!this.checkpointsMapInstance || !cp.expected_lat) return;
            const lat = parseFloat(cp.expected_lat);
            const lng = parseFloat(cp.expected_lng);

            this.checkpointsMapInstance.flyTo([lat, lng], 18, { duration: 1.5 });

            this.checkpointMarkersLayer.eachLayer(layer => {
                if (layer.getLatLng().lat === lat && layer.getLatLng().lng === lng) {
                    layer.openPopup();
                }
            });
        },

        async loadAnalytics() {
            if (!this.selectedTenantId || !this.startDate || !this.endDate) return;
            try {
                const res = await fetch(`${this.apiUrl}?action=analytics&tenant_id=${this.selectedTenantId}&start=${this.startDate}&end=${this.endDate}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    this.analyticsData = Array.isArray(data) ? data : [];
                    this.processAnalytics();
                }
            } catch (e) { console.error(e); }
        },

        processAnalytics() {
            try {
                this.kpiTotal = this.analyticsData.length;
                const groupedByDate = {};
                const pointsSet = new Set();
                const roundsSet = new Set();
                const chartDataMap = {};

                let newHeatMap = {};
                let newMaxHeat = 1;
                for (let i = 0; i < 7; i++) {
                    newHeatMap[i] = Array(24).fill(0);
                }

                this.analyticsData.forEach(scan => {
                    if (!scan.captured_at) return;

                    const dateOnly = scan.captured_at.split(' ')[0];
                    const timeOnly = scan.captured_at.split(' ')[1] || '00:00:00';
                    const cpName = scan.checkpoint_name || 'Desconocido';

                    const d = new Date(scan.captured_at.replace(/-/g, '/'));

                    if (!isNaN(d.getTime())) {
                        const dayOfWeek = d.getDay();
                        const hour = d.getHours();

                        if (newHeatMap[dayOfWeek] && newHeatMap[dayOfWeek][hour] !== undefined) {
                            newHeatMap[dayOfWeek][hour]++;
                            if (newHeatMap[dayOfWeek][hour] > newMaxHeat) {
                                newMaxHeat = newHeatMap[dayOfWeek][hour];
                            }
                        }
                    }

                    pointsSet.add(cpName);
                    if (scan.round_id) {
                        roundsSet.add(scan.round_id);
                    }

                    if (!groupedByDate[dateOnly]) {
                        groupedByDate[dateOnly] = { total: 0, first: timeOnly, last: timeOnly };
                    }

                    groupedByDate[dateOnly].total++;
                    if (timeOnly < groupedByDate[dateOnly].first) groupedByDate[dateOnly].first = timeOnly;
                    if (timeOnly > groupedByDate[dateOnly].last) groupedByDate[dateOnly].last = timeOnly;

                    if (!chartDataMap[cpName]) chartDataMap[cpName] = 0;
                    chartDataMap[cpName]++;
                });

                this.maxHeat = newMaxHeat;
                this.heatMap = newHeatMap;

                this.kpiPuntos = pointsSet.size;
                this.kpiRounds = roundsSet.size;

                const numDays = Object.keys(groupedByDate).length || 1;
                this.kpiPromedio = Math.round(this.kpiTotal / numDays);

                this.rhythms = [];
                this.dailyMetrics = Object.keys(groupedByDate).map(date => {
                    const metrics = groupedByDate[date];
                    const partes = date.split('-');
                    const dateObj = new Date(partes[0], partes[1] - 1, partes[2]);

                    const d1 = new Date(date.replace(/-/g, '/') + ' ' + metrics.first);
                    const d2 = new Date(date.replace(/-/g, '/') + ' ' + metrics.last);

                    const diffMins = (d2 - d1) / 60000;
                    const diffHours = (diffMins / 60).toFixed(1);
                    const avgMins = metrics.total > 1 ? Math.round(diffMins / (metrics.total - 1)) : 0;

                    const dName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
                    this.rhythms.push({
                        date: date,
                        dayName: dName.charAt(0).toUpperCase() + dName.slice(1),
                        minutes: avgMins
                    });

                    return {
                        date: date,
                        dateFormatted: dateObj.toLocaleDateString('es-ES', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
                        total: metrics.total,
                        first: metrics.first.substring(0, 5),
                        last: metrics.last.substring(0, 5),
                        hours: diffHours
                    };
                }).sort((a, b) => (a.date > b.date) ? -1 : 1);

                this.renderChart(chartDataMap);
            } catch (e) {
                console.error("Error en processAnalytics:", e);
            }
        },

        getHeatColor(map, day, hour) {
            try {
                if (!map || !map[day]) return 'bg-slate-100';
                const val = map[day][hour];
                if (!val || val === 0) return 'bg-slate-100';

                const intensity = val / this.maxHeat;
                if (intensity < 0.25) return 'bg-blue-300';
                if (intensity < 0.5) return 'bg-blue-500';
                if (intensity < 0.75) return 'bg-blue-700';
                return 'bg-blue-900';
            } catch (e) { return 'bg-slate-100'; }
        },

        renderChart(dataMap) {
            if (this.currentTab !== 'analytics') return;

            const sortedLabels = Object.keys(dataMap).sort((a, b) => dataMap[b] - dataMap[a]);
            const sortedData = sortedLabels.map(label => dataMap[label]);

            this.chartHeight = Math.max(256, sortedLabels.length * 35 + 60);

            this.$nextTick(() => {
                const ctx = document.getElementById('complianceChart');
                if (!ctx) return;

                if (this.chartInstance) {
                    this.chartInstance.destroy();
                }

                this.chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: sortedLabels,
                        datasets: [{
                            label: 'Veces Escaneado',
                            data: sortedData,
                            backgroundColor: '#3b82f6',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { beginAtZero: true, grid: { display: false } },
                            y: { grid: { display: false } }
                        }
                    }
                });
            });
        },

        async saveNewService() {
            try {
                const res = await fetch(`${this.apiUrl}?action=services`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newService)
                });
                if (res.ok) {
                    this.newService.name = '';
                    this.isNewServiceModalOpen = false;
                    await this.loadTenants();
                }
            } catch (e) { }
        },

        openNewGuardModal() {
            if (!this.selectedTenantId) { alert("Seleccione un servicio primero."); return; }
            this.newGuard = { name: '', pin: Math.floor(1000 + Math.random() * 9000).toString() };
            this.isNewGuardModalOpen = true;
        },

        async saveNewGuard() {
            try {
                const payload = { tenant_id: this.selectedTenantId, name: this.newGuard.name, pin: this.newGuard.pin };
                const res = await fetch(`${this.apiUrl}?action=guards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    this.isNewGuardModalOpen = false;
                    this.loadGuards();
                }
            } catch (e) { }
        },

        async saveNewPoint() {
            if (!this.selectedTenantId) { alert("Seleccione un servicio primero."); return; }
            const generatedUuid = crypto.randomUUID();
            const payload = {
                tenant_id: this.selectedTenantId,
                name: this.newPoint.name,
                lat: this.newPoint.lat,
                lng: this.newPoint.lng,
                tolerance: parseInt(this.newPoint.tolerance),
                uuid: generatedUuid
            };
            try {
                const res = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    this.newPoint = { name: '', lat: '', lng: '', tolerance: 50 };
                    this.isNewPointModalOpen = false;
                    this.loadCheckpoints();
                }
            } catch (e) { }
        },

        confirmDelete(type, item) {
            this.deleteType = type;
            this.itemToDelete = item;
            this.isDeleteModalOpen = true;
        },

        async executeDelete() {
            try {
                const res = await fetch(`${this.apiUrl}?action=${this.deleteType}&id=${this.itemToDelete.id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    this.isDeleteModalOpen = false;
                    if (this.deleteType === 'services') this.loadTenants();
                    if (this.deleteType === 'guards') this.loadGuards();
                    if (this.deleteType === 'checkpoints') this.loadCheckpoints();
                    this.itemToDelete = null;
                }
            } catch (e) { }
        },

        openQrModal(cp) {
            this.selectedCheckpoint = cp;
            this.isModalOpen = true;
            this.$nextTick(() => { this.generateQR(cp.uuid); });
        },

        closeModal() {
            this.isModalOpen = false;
            document.getElementById("qrcode-container").innerHTML = "";
        },

        generateQR(text) {
            this.qrInstance = new QRCode(document.getElementById("qrcode-container"), {
                text: text, width: 200, height: 200, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H
            });
        },

        printQR() {
            window.print();
        }
    }));
});
