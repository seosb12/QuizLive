import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

const base = {
  customClass: {
    popup: "dlg",
    title: "dlg-title",
    htmlContainer: "dlg-text",
    input: "dlg-input",
    validationMessage: "dlg-validation",
    actions: "dlg-actions",
    confirmButton: "btn btn-primary",
    cancelButton: "btn btn-ghost",
  },
  buttonsStyling: false,
  showClass: { popup: "dlg-in" },
  hideClass: { popup: "dlg-out" },
};

export function notify(message, title = "알림") {
  return Swal.fire({ ...base, title, text: String(message ?? ""), confirmButtonText: "확인" });
}

export function toast(message) {
  return Swal.fire({
    ...base,
    toast: true,
    position: "top",
    text: String(message ?? ""),
    showConfirmButton: false,
    timer: 1800,
    customClass: { popup: "dlg dlg-toast", htmlContainer: "dlg-text" },
  });
}

export async function confirmDialog(message, title = "확인", confirmText = "확인", cancelText = "취소", danger = false) {
  const result = await Swal.fire({
    ...base,
    title,
    text: message,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    customClass: {
      ...base.customClass,
      confirmButton: danger ? "btn btn-danger" : "btn btn-primary",
    },
  });
  return result.isConfirmed;
}

// 원격 기기에서 방을 만들 때 관리자 PIN 입력
export async function askAdminPin(tryLogin) {
  const result = await Swal.fire({
    ...base,
    title: "관리자 PIN",
    text: "서버를 켠 PC의 런처 화면에 표시된 6자리 PIN을 입력하세요.",
    input: "text",
    inputAttributes: { inputmode: "numeric", maxlength: "6", autocomplete: "off" },
    showCancelButton: true,
    confirmButtonText: "확인",
    cancelButtonText: "취소",
    reverseButtons: true,
    showLoaderOnConfirm: true,
    preConfirm: async (pin) => {
      const res = await tryLogin(pin);
      if (!res.success) {
        Swal.showValidationMessage(res.message || "PIN이 맞지 않습니다.");
        return false;
      }
      return res;
    },
  });
  return result.isConfirmed ? result.value : null;
}
