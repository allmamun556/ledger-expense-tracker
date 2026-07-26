let monthlyChartInstance = null;
let categoryChartInstance = null;

const CHART_COLORS = ["#B5652B", "#5B7B5B", "#3E6B8A", "#A63D40", "#7A4B8A", "#B08900", "#2E5E4E", "#3B7A78", "#6B4C3B", "#6B7280"];

function renderMonthlyChart(canvasId, labels, values, currency) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 230);
  gradient.addColorStop(0, "rgba(181,101,43,0.28)");
  gradient.addColorStop(1, "rgba(181,101,43,0.02)");

  monthlyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: "#B5652B",
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#1B2A2F",
          pointBorderColor: "#B5652B",
          pointBorderWidth: 2,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1B2A2F",
          padding: 10,
          titleFont: { family: "Inter" },
          bodyFont: { family: "IBM Plex Mono" },
          callbacks: {
            label: (item) => formatMoney(item.parsed.y, currency),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#DCD5C4" },
          ticks: { font: { family: "IBM Plex Mono", size: 11 }, color: "#6B7280" },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: "Inter", size: 11.5 }, color: "#6B7280" },
        },
      },
    },
  });
}

function renderCategoryChart(canvasId, labels, values, colors, currency) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (categoryChartInstance) categoryChartInstance.destroy();

  if (!values.length || values.every((v) => v === 0)) {
    categoryChartInstance = null;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: "#F8F5EE",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { family: "Inter", size: 12 },
            color: "#1B2A2F",
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: "#1B2A2F",
          padding: 10,
          bodyFont: { family: "IBM Plex Mono" },
          callbacks: {
            label: (item) => `${item.label}: ${formatMoney(item.parsed, currency)}`,
          },
        },
      },
    },
  });
}
